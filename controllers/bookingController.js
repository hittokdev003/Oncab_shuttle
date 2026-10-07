'use strict';

const { Op, fn, col } = require('sequelize');
const { Booking, Trip, CustomerUser, Stop, Payment, Refund, Coupon, CouponUsage, Route, Vehicle, Driver, DriverDetail, BusType } = require('../models');
const { logAction } = require('../middleware/auditLog');
const sequelize = require('../config/database');
const { calculateCouponDiscount } = require('../utils/coupon');
const { resolveFare } = require('../utils/fareCalculator');
const SeatReservationService = require('../services/seatReservationService');
const { confirmPaidBooking } = require('../services/bookingConfirmationService');

const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371e3;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

const BOOKING_INCLUDE = [
  {
    model: Trip,
    as: 'trip',
    include: [
      { model: Route, as: 'route' },
      {
        model: Driver,
        as: 'driver',
        attributes: ['id', 'name', 'mobile', 'online_status'],
        required: false,
        include: [
          {
            model: DriverDetail,
            as: 'details',
            attributes: ['latitude', 'longitude', 'location_speed_kmh', 'location_heading', 'location_trip_id', 'updated_at'],
            required: false,
          },
        ],
      },
      {
        model: Vehicle,
        as: 'vehicle',
        attributes: ['id', 'registration_number', 'company_model', 'status', 'latitude', 'longitude'],
        required: false,
      },
    ],
  },
  { model: CustomerUser, as: 'passenger', attributes: ['id', 'name', 'mobile', 'email'] },
  { model: Stop, as: 'origin_stop', attributes: ['id', 'stop_name', 'stop_code', 'latitude', 'longitude', 'address', 'landmark'] },
  { model: Stop, as: 'destination_stop', attributes: ['id', 'stop_name', 'stop_code', 'latitude', 'longitude', 'address', 'landmark'] },
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
    const { trip_id, passenger_id, passenger_name, passenger_mobile, passenger_email, origin_stop_id, destination_stop_id, travel_date, seat_numbers, total_seats, payment_method, coupon_id, coupon_code, device_id, special_requests } = req.body;

    const trip = await Trip.findByPk(trip_id, {
      include: [
        { model: Vehicle, as: 'vehicle', required: false },
        { model: BusType, as: 'bus_type', required: false },
      ],
      transaction: t,
    });
    if (!trip) { await t.rollback(); return res.status(404).json({ success: false, message: 'Trip not found' }); }

    const requestedSeats = SeatReservationService.parseSeatNumbers(seat_numbers || req.body.seat_number || req.body.seats);
    if (requestedSeats.length > 0) {
      const conflictRes = await SeatReservationService.checkSeatConflict({
        tripId: trip.id,
        travelDate: travel_date || trip.trip_date,
        requestedSeats,
        transaction: t,
      });

      if (conflictRes.hasConflict) {
        await t.rollback();
        return res.status(409).json({
          success: false,
          message: `Seat ${conflictRes.conflictingSeat} is already booked`,
          code: 'SEAT_ALREADY_BOOKED',
          data: {
            trip_id: Number(trip.id),
            seat_number: conflictRes.conflictingSeat,
          },
        });
      }
    }

    const effectiveCapacity = trip.vehicle?.total_seats || trip.bus_type?.total_seats || 30;
    const numSeats = total_seats || (requestedSeats.length > 0 ? requestedSeats.length : 1);
    const available = effectiveCapacity - (trip.booked_seats || 0);
    if (available < numSeats) { await t.rollback(); return res.status(409).json({ success: false, message: `Only ${available} seats available` }); }

    const fareResult = await resolveFare({
      routeId: trip.route_id,
      originStopId: origin_stop_id,
      destinationStopId: destination_stop_id,
      fallbackFare: 0,
      transaction: t,
    });
    let total_fare = (fareResult.fare || 0) * (total_seats || 1);
    let discount_amount = 0;
    let appliedCoupon = null;

    if (coupon_id || coupon_code) {
      const couponResult = await calculateCouponDiscount({
        couponId: coupon_id,
        couponCode: coupon_code,
        amount: total_fare,
        seatCount: total_seats || 1,
        passengerId: passenger_id,
        deviceId: device_id,
        transaction: t,
        lock: true,
      });
      if (couponResult.error) {
        await t.rollback();
        return res.status(400).json({ success: false, message: couponResult.error });
      }
      appliedCoupon = couponResult.coupon;
      discount_amount = couponResult.discount;
      await appliedCoupon.increment('used_count', { by: 1, transaction: t });
    }

    const final_amount = Math.max(0, total_fare - discount_amount);
    const booking_reference = `BK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const booking = await Booking.create({
      booking_reference, trip_id, passenger_id, passenger_name, passenger_mobile, passenger_email, origin_stop_id, destination_stop_id, travel_date, seat_numbers, total_seats: total_seats || 1, total_fare, discount_amount, final_amount, payment_method, coupon_id: appliedCoupon?.id || null, special_requests, boarding_pass_code: null, boarding_pin: null, booking_status: 'pending', payment_status: final_amount <= 0 ? 'paid' : 'pending', qr_token: null,
    }, { transaction: t });

    if (final_amount <= 0) await confirmPaidBooking({ booking, transaction: t });

    if (appliedCoupon) {
      await CouponUsage.create({
        coupon_id: appliedCoupon.id,
        booking_id: booking.id,
        passenger_id,
        device_id: device_id ? String(device_id).trim() : null,
        discount_amount,
      }, { transaction: t });
    }

    await logAction({ userId: req.user?.id, userType: req.user?.role?.name, userName: req.user?.name, action: 'create', module: 'bookings', entityType: 'Booking', entityId: booking.id, newValues: { booking_reference, trip_id, final_amount }, ipAddress: req.ip, description: `Created booking ${booking_reference}` });

    await t.commit();
    const created = await Booking.findByPk(booking.id, { include: BOOKING_INCLUDE });
    const createdData = created.toJSON();
    res.status(201).json({ success: true, message: final_amount <= 0 ? 'Booking confirmed' : 'Booking created and awaiting payment', data: { booking_id: created.id, ...createdData } });
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

    const wasSeatAllocated = booking.booking_status === 'confirmed' && booking.payment_status === 'paid';
    const { cancellation_reason } = req.body;
    await booking.update({ booking_status: 'cancelled', status: 'Cancelled', cancellation_reason, cancelled_at: new Date(), cancelled_by: req.user?.id }, { transaction: t });

    const trip = await Trip.findByPk(booking.trip_id, { transaction: t });
    if (trip && wasSeatAllocated) await trip.decrement('booked_seats', { by: booking.total_seats, transaction: t });

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
  const t = await sequelize.transaction();
  try {
    const booking = await Booking.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!booking) { await t.rollback(); return res.status(404).json({ success: false, message: 'Booking not found' }); }
    const { payment_status, transaction_id, payment_method } = req.body;
    if (booking.booking_status === 'cancelled' && payment_status === 'paid') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Cancelled booking cannot be marked paid' });
    }
    const wasPaid = booking.payment_status === 'paid';
    await booking.update({ payment_status, transaction_id, payment_method }, { transaction: t });
    if (payment_status === 'paid') {
      if (!wasPaid && Number(booking.final_amount) > 0) {
        await Payment.create({ booking_id: booking.id, passenger_id: booking.passenger_id, amount: booking.final_amount, payment_method, status: 'captured' }, { transaction: t });
      }
      await confirmPaidBooking({ booking, transaction: t });
    }
    await t.commit();
    res.json({ success: true, message: 'Payment updated', data: booking });
  } catch (err) {
    if (!t.finished) await t.rollback();
    next(err);
  }
};

// ── Track Booking Bus & Boarding Stop ──────────────────────────────
exports.track = async (req, res, next) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: BOOKING_INCLUDE });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const bookingData = booking.toJSON();
    const trip = bookingData.trip || {};
    const driver = trip.driver || {};
    const driverDetail = driver.details || {};
    const vehicle = trip.vehicle || {};
    const originStop = bookingData.origin_stop || {};
    const destinationStop = bookingData.destination_stop || {};

    const busLatRaw = driverDetail.latitude != null ? driverDetail.latitude : vehicle.latitude;
    const busLngRaw = driverDetail.longitude != null ? driverDetail.longitude : vehicle.longitude;
    const hasBusLocation = busLatRaw != null && busLngRaw != null && !isNaN(Number(busLatRaw)) && !isNaN(Number(busLngRaw));

    const busLocation = hasBusLocation
      ? {
          latitude: Number(busLatRaw),
          longitude: Number(busLngRaw),
          speed_kmh: driverDetail.location_speed_kmh != null ? Number(driverDetail.location_speed_kmh) : 0,
          heading: driverDetail.location_heading != null ? Number(driverDetail.location_heading) : 0,
          updated_at: driverDetail.updated_at || null,
          driver_name: driver.name || 'Assigned Driver',
          driver_mobile: driver.mobile || null,
          vehicle_registration: vehicle.registration_number || null,
          online_status: driver.online_status || 'offline',
        }
      : null;

    const originLatRaw = originStop.latitude;
    const originLngRaw = originStop.longitude;
    const hasOriginLocation = originLatRaw != null && originLngRaw != null && !isNaN(Number(originLatRaw)) && !isNaN(Number(originLngRaw));

    const boardingStop = hasOriginLocation
      ? {
          id: originStop.id,
          stop_name: originStop.stop_name,
          stop_code: originStop.stop_code,
          latitude: Number(originLatRaw),
          longitude: Number(originLngRaw),
          address: originStop.address || null,
        }
      : null;

    const destLatRaw = destinationStop.latitude;
    const destLngRaw = destinationStop.longitude;
    const hasDestLocation = destLatRaw != null && destLngRaw != null && !isNaN(Number(destLatRaw)) && !isNaN(Number(destLngRaw));

    const destinationLocation = hasDestLocation
      ? {
          id: destinationStop.id,
          stop_name: destinationStop.stop_name,
          stop_code: destinationStop.stop_code,
          latitude: Number(destLatRaw),
          longitude: Number(destLngRaw),
          address: destinationStop.address || null,
        }
      : null;

    let distanceMeters = null;
    let distanceText = 'N/A';
    let trackingStatus = 'NO_GPS';
    let trackingStatusMessage = 'Bus/Driver GPS location unavailable';

    if (busLocation && boardingStop) {
      distanceMeters = calculateDistanceMeters(
        busLocation.latitude,
        busLocation.longitude,
        boardingStop.latitude,
        boardingStop.longitude
      );

      if (distanceMeters !== null) {
        if (distanceMeters < 1000) {
          distanceText = `${distanceMeters} m`;
        } else {
          distanceText = `${(distanceMeters / 1000).toFixed(2)} km`;
        }

        if (distanceMeters <= 150) {
          trackingStatus = 'ARRIVED';
          trackingStatusMessage = `Bus HAS ARRIVED at Pickup Stop (${boardingStop.stop_name})`;
        } else if (distanceMeters <= 1000) {
          trackingStatus = 'ARRIVING_SOON';
          trackingStatusMessage = `Bus is ARRIVING SOON (${distanceText} away from ${boardingStop.stop_name})`;
        } else {
          trackingStatus = 'EN_ROUTE';
          trackingStatusMessage = `Bus is EN ROUTE (${distanceText} away from ${boardingStop.stop_name})`;
        }
      }
    } else if (!boardingStop) {
      trackingStatusMessage = 'Pickup stop coordinates not configured';
    }

    res.json({
      success: true,
      data: {
        booking_id: booking.id,
        booking_reference: booking.booking_reference,
        passenger_name: booking.passenger_name,
        passenger_mobile: booking.passenger_mobile,
        travel_date: booking.travel_date,
        bus_location: busLocation,
        boarding_stop: boardingStop,
        destination_stop: destinationLocation,
        distance_meters: distanceMeters,
        distance_text: distanceText,
        tracking_status: trackingStatus,
        tracking_status_message: trackingStatusMessage,
      },
    });
  } catch (err) {
    next(err);
  }
};
