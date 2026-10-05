'use strict';

const { Op } = require('sequelize');
const { Trip, Route, Stop, Driver, Vehicle, BusType, Booking } = require('../models');
const { logAction } = require('../middleware/auditLog');

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

const TRIP_INCLUDE = [
  { model: Route, as: 'route', attributes: ['id', 'route_name', 'route_code', 'origin_city', 'destination_city'] },
  { model: Driver, as: 'driver', attributes: ['id', 'name', 'mobile', 'photo'] },
  { model: Vehicle, as: 'vehicle', attributes: ['id', 'registration_number', 'company_model', 'color'] },
  { model: BusType, as: 'bus_type', attributes: ['id', 'name', 'total_seats'] },
];

const TRIP_DETAILS_INCLUDE = [
  {
    model: Route,
    as: 'route',
    attributes: ['id', 'route_name', 'route_code', 'origin_city', 'destination_city'],
    include: [{ model: Stop, as: 'stops', attributes: ['id', 'stop_name', 'latitude', 'longitude', 'stop_sequence'] }],
  },
  ...TRIP_INCLUDE.filter((include) => include.as !== 'route'),
];

// ── List Trips ─────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page, limit, search, status, route_id, trip_date, from_date, to_date } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = {};
    if (search) where.schedule_code = { [Op.like]: `%${search}%` };
    if (status) where.status = status;
    if (route_id) where.route_id = route_id;
    if (trip_date) where.trip_date = trip_date;
    if (from_date && to_date) where.trip_date = { [Op.between]: [from_date, to_date] };

    const { count, rows } = await Trip.findAndCountAll({
      where,
      include: TRIP_INCLUDE,
      offset, limit: lim,
      order: [['trip_date', 'DESC'], ['departure_time', 'ASC']],
    });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) {
    next(err);
  }
};

// ── Get Trip ───────────────────────────────────────────────
exports.show = async (req, res, next) => {
  try {
    const trip = await Trip.findByPk(req.params.id, { include: TRIP_DETAILS_INCLUDE });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    const bookingsCount = await Booking.count({ where: { trip_id: trip.id, booking_status: { [Op.ne]: 'cancelled' } } });
    res.json({ success: true, data: { ...trip.toJSON(), bookings_count: bookingsCount } });
  } catch (err) {
    next(err);
  }
};

// ── Create Trip ────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    let { schedule_code, route_id, bus_type_id, departure_time, arrival_time, operating_days, trip_date, valid_from, valid_until, driver_id, vehicle_id, notes } = req.body;
    const exists = await Trip.findOne({ where: { schedule_code } });
    if (exists) return res.status(409).json({ success: false, message: 'Schedule code already exists' });

    if (!bus_type_id && vehicle_id) {
      const vehicle = await Vehicle.findByPk(vehicle_id);
      if (vehicle && vehicle.bus_type_id) {
        bus_type_id = vehicle.bus_type_id;
      }
    }

    const trip = await Trip.create({ schedule_code, route_id, bus_type_id, departure_time, arrival_time, operating_days, trip_date, valid_from, valid_until, driver_id, vehicle_id, notes });

    await logAction({ userId: req.user?.id, userType: req.user?.role?.name, userName: req.user?.name, action: 'create', module: 'trips', entityType: 'Trip', entityId: trip.id, newValues: { schedule_code, trip_date }, ipAddress: req.ip, description: `Created trip ${schedule_code}` });

    const created = await Trip.findByPk(trip.id, { include: TRIP_INCLUDE });
    res.status(201).json({ success: true, message: 'Trip created', data: created });
  } catch (err) {
    next(err);
  }
};

// ── Update Trip ────────────────────────────────────────────
exports.update = async (req, res, next) => {
  try {
    const trip = await Trip.findByPk(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    const payload = { ...req.body };
    if (!payload.bus_type_id && payload.vehicle_id) {
      const vehicle = await Vehicle.findByPk(payload.vehicle_id);
      if (vehicle && vehicle.bus_type_id) {
        payload.bus_type_id = vehicle.bus_type_id;
      }
    }
    await trip.update(payload);
    const updated = await Trip.findByPk(trip.id, { include: TRIP_INCLUDE });
    res.json({ success: true, message: 'Trip updated', data: updated });
  } catch (err) {
    next(err);
  }
};

// ── Delete Trip ────────────────────────────────────────────
exports.destroy = async (req, res, next) => {
  try {
    const trip = await Trip.findByPk(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    const bookingsCount = await Booking.count({ where: { trip_id: trip.id } });
    if (bookingsCount > 0) return res.status(409).json({ success: false, message: `Cannot delete: ${bookingsCount} bookings exist` });
    await trip.destroy();
    res.json({ success: true, message: 'Trip deleted' });
  } catch (err) {
    next(err);
  }
};

// ── Update Trip Status ─────────────────────────────────────
exports.updateStatus = async (req, res, next) => {
  try {
    const trip = await Trip.findByPk(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    const { status } = req.body;
    const updates = { status };
    if (status === 'Active') updates.started_at = new Date();
    if (status === 'Completed') updates.completed_at = new Date();
    await trip.update(updates);
    res.json({ success: true, message: `Trip ${status}`, data: trip });
  } catch (err) {
    next(err);
  }
};

// ── Assign Driver ──────────────────────────────────────────
exports.assignDriver = async (req, res, next) => {
  try {
    const trip = await Trip.findByPk(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    const { driver_id } = req.body;
    const driver = await Driver.findByPk(driver_id);
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
    await trip.update({ driver_id });
    res.json({ success: true, message: 'Driver assigned', data: { trip_id: trip.id, driver_id } });
  } catch (err) {
    next(err);
  }
};

// ── Assign Vehicle ─────────────────────────────────────────
exports.assignVehicle = async (req, res, next) => {
  try {
    const trip = await Trip.findByPk(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    const { vehicle_id } = req.body;
    const vehicle = await Vehicle.findByPk(vehicle_id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    const payload = { vehicle_id };
    if (vehicle.bus_type_id) {
      payload.bus_type_id = vehicle.bus_type_id;
    }
    await trip.update(payload);
    res.json({ success: true, message: 'Vehicle assigned', data: { trip_id: trip.id, vehicle_id, bus_type_id: payload.bus_type_id || trip.bus_type_id } });
  } catch (err) {
    next(err);
  }
};
