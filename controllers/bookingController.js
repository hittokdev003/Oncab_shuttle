'use strict';

const { Op, fn, col } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { Booking, Trip, CustomerUser, Stop, Payment, Refund, Coupon, Route, Vehicle, Driver } = require('../models');
const { logAction } = require('../middleware/auditLog');
const sequelize = require('../config/database');

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

const BOOKING_INCLUDE = [
  { model: Trip, as: 'trip', include: [{ model: Route, as: 'route' }] },
  { model: CustomerUser, as: 'passenger', attributes: ['id', 'name', 'mobile', 'email'] },
  { model: Stop, as: 'origin_stop', attributes: ['id', 'stop_name'] },
  { model: Stop, as: 'destination_stop', attributes: ['id', 'stop_name'] },
  { model: Coupon, as: 'coupon', attributes: ['id', 'code', 'code_type', 'amount'] },
];

// ── List Bookings ──────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page, limit, search, booking_status, payment_status, from_date, to_date, trip_id } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = {};
    if (search) where[Op.or] = [{ booking_reference: { [Op.like]: `%${search}%` } }, { passenger_name: { [Op.like]: `%${search}%` } }, { passenger_mobile: { [Op.like]: `%${search}%` } }];
    if (booking_status) where.booking_status = booking_status;
    if (payment_status) where.payment_status = payment_status;
    if (trip_id) where.trip_id = trip_id;
    if (from_date && to_date) where.travel_date = { [Op.between]: [from_date, to_date] };

    const { count, rows } = await Booking.findAndCountAll({ where, include: BOOKING_INCLUDE, offset, limit: lim, order: [['created_at', 'DESC']] });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) {
    next(err);
  }
};

// ── Get Booking ────────────────────────────────────────────
exports.show = async (req, res, next) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: [...BOOKING_INCLUDE, { model: Payment, as: 'payments' }, { model: Refund, as: 'refunds' }] });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// ── Create Booking ─────────────────────────────────────────
exports.create = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { trip_id, passenger_id, passenger_name, passenger_mobile, passenger_email, origin_stop_id, destination_stop_id, travel_date, seat_numbers, total_seats, payment_method, coupon_id, special_requests } = req.body;

    const trip = await Trip.findByPk(trip_id, {
      include: [
        { model: Vehicle, as: 'vehicle', required: false },
        { model: BusType, as: 'bus_type', required: false },
      ],
      transaction: t,
    });
    if (!trip) { await t.rollback(); return res.status(404).json({ success: false, message: 'Trip not found' }); }

    const effectiveCapacity = trip.vehicle?.total_seats || trip.bus_type?.total_seats || 30;
    const available = effectiveCapacity - (trip.booked_seats || 0);
    if (available < (total_seats || 1)) { await t.rollback(); return res.status(409).json({ success: false, message: `Only ${available} seats available` }); }

    const fareResult = await resolveFare({
      routeId: trip.route_id,
      originStopId: origin_stop_id,
      destinationStopId: destination_stop_id,
      fallbackFare: 0,
      transaction: t,
    });
    let total_fare = (fareResult.fare || 0) * (total_seats || 1);
    let discount_amount = 0;

    if (coupon_id) {
      const coupon = await Coupon.findByPk(coupon_id, { transaction: t });
      if (coupon && coupon.status === 'Active') {
        if (coupon.code_type === 'FLAT') discount_amount = Math.min(coupon.amount, total_fare);
        else discount_amount = Math.min((total_fare * coupon.amount) / 100, coupon.max_discount || Infinity);
        await coupon.increment('used_count', { transaction: t });
      }
    }

    const final_amount = Math.max(0, total_fare - discount_amount);
    const booking_reference = `BK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const boarding_pass_code = `BP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const boarding_pin = Math.floor(1000 + Math.random() * 9000).toString();

    const booking = await Booking.create({
      booking_reference, trip_id, passenger_id, passenger_name, passenger_mobile, passenger_email, origin_stop_id, destination_stop_id, travel_date, seat_numbers, total_seats: total_seats || 1, total_fare, discount_amount, final_amount, payment_method, coupon_id, special_requests, boarding_pass_code, boarding_pin, booking_status: 'confirmed', payment_status: 'pending', qr_token: uuidv4(),
    }, { transaction: t });

    await trip.increment('booked_seats', { by: total_seats || 1, transaction: t });

    await logAction({ userId: req.user?.id, userType: req.user?.role?.name, userName: req.user?.name, action: 'create', module: 'bookings', entityType: 'Booking', entityId: booking.id, newValues: { booking_reference, trip_id, final_amount }, ipAddress: req.ip, description: `Created booking ${booking_reference}` });

    await t.commit();
    const created = await Booking.findByPk(booking.id, { include: BOOKING_INCLUDE });
    const createdData = created.toJSON();
    res.status(201).json({ success: true, message: 'Booking confirmed', data: { booking_id: created.id, ...createdData } });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// ── Cancel Booking ─────────────────────────────────────────
exports.cancel = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const booking = await Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ success: false, message: 'Booking not found' }); }
    if (booking.booking_status === 'cancelled') { await t.rollback(); return res.status(400).json({ success: false, message: 'Booking already cancelled' }); }

    const { cancellation_reason } = req.body;
    await booking.update({ booking_status: 'cancelled', status: 'Cancelled', cancellation_reason, cancelled_at: new Date(), cancelled_by: req.user?.id }, { transaction: t });

    const trip = await Trip.findByPk(booking.trip_id, { transaction: t });
    if (trip) await trip.decrement('booked_seats', { by: booking.total_seats, transaction: t });

    // Auto-create refund if payment was captured
    if (booking.payment_status === 'paid') {
      const passenger = booking.passenger_id
        ? await CustomerUser.findByPk(booking.passenger_id, { transaction: t })
        : await CustomerUser.findOne({ where: { mobile: booking.passenger_mobile }, transaction: t });
      const payment = await Payment.findOne({ where: { booking_id: booking.id, status: ['captured', 'partial_refund'] }, order: [['created_at', 'DESC']], transaction: t });
      const refund_reference = `REF-${Date.now()}`;
      await Refund.create({ booking_id: booking.id, payment_id: payment?.id || null, passenger_id: passenger?.id || booking.passenger_id, refund_reference, refund_amount: booking.final_amount, refund_reason: cancellation_reason || 'Cancelled by admin', status: 'pending', initiated_by: req.user?.id }, { transaction: t });
    }

    await t.commit();
    res.json({ success: true, message: 'Booking cancelled', data: booking });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// ── Cancelled Bookings ─────────────────────────────────────
exports.cancelledList = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = { booking_status: 'cancelled' };
    if (search) where[Op.or] = [{ booking_reference: { [Op.like]: `%${search}%` } }, { passenger_name: { [Op.like]: `%${search}%` } }];

    const { count, rows } = await Booking.findAndCountAll({ where, include: [...BOOKING_INCLUDE, { model: Refund, as: 'refunds', attributes: ['id', 'status', 'refund_amount', 'refund_reference', 'refund_method'], separate: true, order: [['created_at', 'DESC']] }], offset, limit: lim, order: [['cancelled_at', 'DESC']] });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) {
    next(err);
  }
};

// ── Update Booking Payment ─────────────────────────────────
exports.updatePayment = async (req, res, next) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    const { payment_status, transaction_id, payment_method } = req.body;
    await booking.update({ payment_status, transaction_id, payment_method });
    if (payment_status === 'paid') {
      await Payment.create({ booking_id: booking.id, passenger_id: booking.passenger_id, amount: booking.final_amount, payment_method, status: 'captured' });
    }
    res.json({ success: true, message: 'Payment updated', data: booking });
  } catch (err) {
    next(err);
  }
};
