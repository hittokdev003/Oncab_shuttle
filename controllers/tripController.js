'use strict';

const { Op } = require('sequelize');
const { Trip, Route, Stop, Driver, Vehicle, BusType, Booking, OwnerApprovalRequest } = require('../models');
const { logAction } = require('../middleware/auditLog');
const { hasRole } = require('../utils/roles');

const isOwnerRole = (req) => hasRole(req.user, 'owner');
const ownerCanReadBookings = (req) => (req.userPermissions || []).some((permission) => ['bookings.read', 'bookings.manage'].includes(permission));

const requireOwnerBookingAccess = (req, res) => {
  if (!isOwnerRole(req) || ownerCanReadBookings(req)) return true;
  res.status(403).json({ success: false, message: 'Booking access is required to request assignment changes' });
  return false;
};

const submitOwnerAssignmentRequest = async (req, res, trip) => {
  if (!requireOwnerBookingAccess(req, res)) return;
  const assignmentFields = ['driver_id', 'vehicle_id'];
  const submittedFields = Object.keys(req.body || {});
  if (!submittedFields.some((field) => assignmentFields.includes(field))
    || submittedFields.some((field) => !assignmentFields.includes(field))) {
    return res.status(403).json({ success: false, message: 'Owners can only request trip driver or vehicle changes' });
  }

  const payload = {};
  let ownsCurrentAssignment = false;
  if (trip.driver_id) {
    const currentDriver = await Driver.findByPk(trip.driver_id);
    ownsCurrentAssignment = Number(currentDriver?.owner_id) === Number(req.user.id);
  }
  if (trip.vehicle_id) {
    const currentVehicle = await Vehicle.findByPk(trip.vehicle_id);
    ownsCurrentAssignment = ownsCurrentAssignment || Number(currentVehicle?.owner_id) === Number(req.user.id);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'driver_id')) {
    const driverId = req.body.driver_id ? Number(req.body.driver_id) : null;
    if (driverId) {
      const driver = await Driver.findOne({ where: { id: driverId, owner_id: req.user.id } });
      if (!driver) return res.status(403).json({ success: false, message: 'Select a driver from your own fleet' });
      ownsCurrentAssignment = true;
    }
    payload.driver_id = driverId;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'vehicle_id')) {
    const vehicleId = req.body.vehicle_id ? Number(req.body.vehicle_id) : null;
    if (vehicleId) {
      const vehicle = await Vehicle.findOne({ where: { id: vehicleId, owner_id: req.user.id } });
      if (!vehicle) return res.status(403).json({ success: false, message: 'Select a vehicle from your own fleet' });
      ownsCurrentAssignment = true;
    }
    payload.vehicle_id = vehicleId;
  }
  if (!ownsCurrentAssignment) {
    return res.status(403).json({ success: false, message: 'This trip is not assigned to your fleet' });
  }

  const approvalRequest = await OwnerApprovalRequest.create({
    owner_id: req.user.id,
    request_type: 'trip_assignment',
    target_id: trip.id,
    payload: JSON.stringify(payload),
  });
  return res.status(202).json({
    success: true,
    message: 'Trip assignment request sent to admin for approval',
    data: approvalRequest,
  });
};

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

const TRIP_INCLUDE = [
  { model: Route, as: 'route', attributes: ['id', 'route_name', 'route_code', 'origin_city', 'destination_city'] },
  { model: Driver, as: 'driver', attributes: ['id', 'owner_id', 'name', 'mobile', 'photo'] },
  { model: Vehicle, as: 'vehicle', attributes: ['id', 'owner_id', 'registration_number', 'company_model', 'color'] },
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

const scopeTripIncludes = (req, includes) => includes.map((include) => {
  if (!isOwnerRole(req) || !['driver', 'vehicle'].includes(include.as)) return include;
  const Model = include.as === 'driver' ? Driver : Vehicle;
  return { ...include, model: Model, where: { owner_id: req.user.id }, required: false };
});

// ── Helper to normalize date string to YYYY-MM-DD ──────────
const normalizeDateStr = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const str = dateStr.trim();
  const parts = str.split(/[-/]/).map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    let y, m, d;
    if (parts[0] >= 1000) {
      // YYYY-MM-DD format
      y = parts[0]; m = parts[1]; d = parts[2];
    } else if (parts[2] >= 1000) {
      // DD-MM-YYYY format
      y = parts[2]; m = parts[1]; d = parts[0];
    }
    if (y && m && d) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return str;
};

// ── Helper to parse date string into local Date object ───────
const parseLocalDate = (dateStr) => {
  const norm = normalizeDateStr(dateStr);
  if (!norm || typeof norm !== 'string') return new Date();
  const parts = norm.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(norm);
};

// ── Helper to check if a date matches operating_days ─────────
const isOperatingDay = (dateObj, operatingDays) => {
  if (!operatingDays) return true;
  const str = String(operatingDays).toLowerCase().trim();
  if (str === 'daily' || str === 'all' || str === '7' || str === '1,2,3,4,5,6,7') return true;

  const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayName = dayNames[dayOfWeek];

  if (str === 'weekdays' && isoDay >= 1 && isoDay <= 5) return true;
  if (str === 'weekends' && (isoDay === 6 || isoDay === 7)) return true;

  const tokens = str.split(/[,;\s]+/).map((s) => s.trim());
  return tokens.includes(String(isoDay)) || tokens.includes(String(dayOfWeek)) || tokens.includes(dayName);
};

// ── Helper to ensure trip instances exist for a date range ────
const ensureTripInstancesForRange = async (startStr, endStr) => {
  try {
    const normStart = normalizeDateStr(startStr);
    const normEnd = normalizeDateStr(endStr || startStr);
    const startDateObj = parseLocalDate(normStart);
    const endDateObj = parseLocalDate(normEnd);
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) return;

    // Limit maximum auto-generation window per request to 60 days
    const maxEnd = new Date(startDateObj.getTime() + 60 * 24 * 60 * 60 * 1000);
    const finalEnd = endDateObj > maxEnd ? maxEnd : endDateObj;

    const masterSchedules = await Trip.findAll({
      where: {
        status: { [Op.notIn]: ['Cancelled', 'Completed', 'Inactive'] },
      },
    });

    if (masterSchedules.length === 0) return;

    const curr = new Date(startDateObj);
    while (curr <= finalEnd) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      for (const master of masterSchedules) {
        if (master.valid_from && dateStr < master.valid_from) continue;
        if (master.valid_until && dateStr > master.valid_until) continue;

        if (!isOperatingDay(curr, master.operating_days)) continue;

        const existing = await Trip.findOne({
          where: {
            [Op.or]: [
              { schedule_code: master.schedule_code, trip_date: dateStr },
              { route_id: master.route_id, departure_time: master.departure_time, trip_date: dateStr },
            ],
          },
        });

        if (!existing) {
          await Trip.create({
            schedule_code: master.schedule_code,
            route_id: master.route_id,
            bus_type_id: master.bus_type_id,
            departure_time: master.departure_time,
            arrival_time: master.arrival_time,
            operating_days: master.operating_days,
            trip_date: dateStr,
            valid_from: master.valid_from,
            valid_until: master.valid_until,
            driver_id: master.driver_id,
            vehicle_id: master.vehicle_id,
            status: 'Scheduled',
            notes: master.notes ? `Generated from master schedule: ${master.notes}` : `Generated trip for ${dateStr}`,
          });
        }
      }

      curr.setDate(curr.getDate() + 1);
    }
  } catch (err) {
    console.error('ensureTripInstancesForRange error:', err);
  }
};

// ── List Trips ─────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    let { page, limit, search, status, route_id, driver_id, trip_date, from_date, to_date } = req.query;

    if (trip_date) trip_date = normalizeDateStr(trip_date);
    if (from_date) from_date = normalizeDateStr(from_date);
    if (to_date) to_date = normalizeDateStr(to_date);

    const targetFrom = from_date || trip_date || new Date().toISOString().split('T')[0];
    const targetTo = to_date || trip_date || targetFrom;

    if (targetFrom && targetTo && !isOwnerRole(req)) {
      await ensureTripInstancesForRange(targetFrom, targetTo);
    }

    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = {};
    if (search) {
      where[Op.or] = [
        { schedule_code: { [Op.like]: `%${search}%` } },
        { '$route.route_name$': { [Op.like]: `%${search}%` } },
        { '$driver.name$': { [Op.like]: `%${search}%` } },
      ];
    }
    if (status) where.status = status;
    if (route_id) where.route_id = route_id;
    if (driver_id) where.driver_id = driver_id;
    if (trip_date) where.trip_date = trip_date;
    if (from_date && to_date) where.trip_date = { [Op.between]: [from_date, to_date] };
    if (from_date && !to_date) where.trip_date = { [Op.gte]: from_date };
    if (to_date && !from_date) where.trip_date = { [Op.lte]: to_date };

    if (isOwnerRole(req)) {
      const [ownedDrivers, ownedVehicles] = await Promise.all([
        Driver.findAll({ attributes: ['id'], where: { owner_id: req.user.id }, raw: true }),
        Vehicle.findAll({ attributes: ['id'], where: { owner_id: req.user.id }, raw: true }),
      ]);
      where[Op.or] = [
        { driver_id: { [Op.in]: ownedDrivers.map((driver) => driver.id) } },
        { vehicle_id: { [Op.in]: ownedVehicles.map((vehicle) => vehicle.id) } },
      ];
    }

    const { count, rows } = await Trip.findAndCountAll({
      where,
      include: scopeTripIncludes(req, TRIP_INCLUDE),
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
    const trip = await Trip.findByPk(req.params.id, { include: scopeTripIncludes(req, TRIP_DETAILS_INCLUDE) });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    if (isOwnerRole(req)) {
      if (!ownerCanReadBookings(req)) {
        return res.status(403).json({ success: false, message: 'Booking access is required to view trip details' });
      }
      const ownsDriver = trip.driver && Number(trip.driver.owner_id) === Number(req.user.id);
      const ownsVehicle = trip.vehicle && Number(trip.vehicle.owner_id) === Number(req.user.id);
      if (!ownsDriver && !ownsVehicle) return res.status(403).json({ success: false, message: 'This trip is not assigned to your fleet' });
    }
    const bookingsCount = await Booking.count({ where: { trip_id: trip.id, booking_status: { [Op.ne]: 'cancelled' } } });
    res.json({ success: true, data: { ...trip.toJSON(), bookings_count: bookingsCount } });
  } catch (err) {
    next(err);
  }
};

exports.assignmentOptions = async (req, res, next) => {
  try {
    if (!isOwnerRole(req)) {
      return res.status(403).json({ success: false, message: 'Owner role required' });
    }
    const [drivers, vehicles] = await Promise.all([
      Driver.findAll({
        attributes: ['id', 'name', 'mobile'],
        where: { owner_id: req.user.id },
        order: [['name', 'ASC']],
      }),
      Vehicle.findAll({
        attributes: ['id', 'registration_number', 'company_model', 'bus_type_id'],
        where: { owner_id: req.user.id },
        include: [{ model: BusType, as: 'bus_type', attributes: ['id', 'name'] }],
        order: [['registration_number', 'ASC']],
      }),
    ]);
    return res.json({ success: true, data: { drivers, vehicles } });
  } catch (err) {
    return next(err);
  }
};

// ── Create Trip ────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    if (isOwnerRole(req)) return res.status(403).json({ success: false, message: 'Owners cannot create trips directly' });
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

    const startDate = valid_from || trip_date || new Date().toISOString().split('T')[0];
    const endDate = valid_until || new Date(parseLocalDate(startDate).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await ensureTripInstancesForRange(startDate, endDate);

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
    if (!requireOwnerBookingAccess(req, res)) return;
    const oldTrip = await Trip.findByPk(req.params.id);
    if (!oldTrip) return res.status(404).json({ success: false, message: 'Trip not found' });
    if (isOwnerRole(req)) return submitOwnerAssignmentRequest(req, res, oldTrip);

    const payload = { ...req.body };
    if (!payload.bus_type_id && payload.vehicle_id) {
      const vehicle = await Vehicle.findByPk(payload.vehicle_id);
      if (vehicle && vehicle.bus_type_id) {
        payload.bus_type_id = vehicle.bus_type_id;
      }
    }

    // Default to creating a NEW ROW in database with a NEW ID when editing Master Schedules
    const createNewRow = payload.create_new_row !== false;

    if (createNewRow) {
      // 1. Mark original trip schedule as Cancelled so it doesn't duplicate future trip generation
      await oldTrip.update({ status: 'Cancelled' });

      // 2. Generate a new unique schedule code
      let newScheduleCode = `SCH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const existingCode = await Trip.findOne({ where: { schedule_code: newScheduleCode } });
      if (existingCode) {
        newScheduleCode = `SCH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // 3. Insert NEW ROW in trips table with brand new auto-increment ID
      const newTrip = await Trip.create({
        schedule_code: newScheduleCode,
        route_id: payload.route_id ? parseInt(payload.route_id) : oldTrip.route_id,
        driver_id: payload.driver_id !== undefined ? (payload.driver_id ? parseInt(payload.driver_id) : null) : oldTrip.driver_id,
        vehicle_id: payload.vehicle_id !== undefined ? (payload.vehicle_id ? parseInt(payload.vehicle_id) : null) : oldTrip.vehicle_id,
        bus_type_id: payload.bus_type_id || oldTrip.bus_type_id,
        departure_time: payload.departure_time || oldTrip.departure_time,
        arrival_time: payload.arrival_time || oldTrip.arrival_time,
        operating_days: Array.isArray(payload.operating_days) ? payload.operating_days.join(',') : (payload.operating_days || oldTrip.operating_days),
        trip_date: payload.trip_date || payload.valid_from || oldTrip.trip_date || new Date().toISOString().split('T')[0],
        valid_from: payload.valid_from || oldTrip.valid_from,
        valid_until: payload.valid_until || oldTrip.valid_until,
        seat_capacity: payload.seat_capacity ? parseInt(payload.seat_capacity) : oldTrip.seat_capacity,
        status: payload.status || 'Scheduled',
        notes: payload.notes || oldTrip.notes,
      });

      // 4. Generate future trip instances for the new schedule
      const startDate = newTrip.valid_from || newTrip.trip_date || new Date().toISOString().split('T')[0];
      const endDate = newTrip.valid_until || new Date(parseLocalDate(startDate).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await ensureTripInstancesForRange(startDate, endDate);

      await logAction({
        userId: req.user?.id,
        userType: req.user?.role?.name,
        userName: req.user?.name,
        action: 'create',
        module: 'trips',
        entityType: 'Trip',
        entityId: newTrip.id,
        newValues: { schedule_code: newScheduleCode, original_trip_id: oldTrip.id },
        ipAddress: req.ip,
        description: `Created new master schedule #${newTrip.id} (${newScheduleCode}) versioned from #${oldTrip.id}`,
      });

      const updatedNew = await Trip.findByPk(newTrip.id, { include: TRIP_INCLUDE });
      return res.status(201).json({
        success: true,
        message: `New Master Schedule created with ID #${newTrip.id} (${newScheduleCode})`,
        data: updatedNew,
      });
    }

    // Direct in-place update fallback if create_new_row: false is explicitly passed
    await oldTrip.update(payload);
    const updated = await Trip.findByPk(oldTrip.id, { include: TRIP_INCLUDE });
    res.json({ success: true, message: 'Trip updated', data: updated });
  } catch (err) {
    next(err);
  }
};

// ── Delete Trip ────────────────────────────────────────────
exports.destroy = async (req, res, next) => {
  try {
    if (isOwnerRole(req)) return res.status(403).json({ success: false, message: 'Owners cannot delete trips' });
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
    if (isOwnerRole(req)) return res.status(403).json({ success: false, message: 'Only admins and operators can change trip status' });
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
    if (!requireOwnerBookingAccess(req, res)) return;
    const trip = await Trip.findByPk(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    if (isOwnerRole(req)) return submitOwnerAssignmentRequest(req, res, trip);
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
    if (!requireOwnerBookingAccess(req, res)) return;
    const trip = await Trip.findByPk(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    if (isOwnerRole(req)) return submitOwnerAssignmentRequest(req, res, trip);
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

// ── Bulk Generate Future Trips Endpoint ───────────────────────
exports.generateFutureTrips = async (req, res, next) => {
  try {
    if (isOwnerRole(req)) return res.status(403).json({ success: false, message: 'Owners cannot generate trips' });
    const { start_date, end_date, days_ahead = 14, schedule_ids } = req.body || {};

    const today = new Date();
    const startDateObj = start_date ? parseLocalDate(start_date) : today;
    let endDateObj = end_date ? parseLocalDate(end_date) : new Date(startDateObj.getTime() + (parseInt(days_ahead) || 14) * 24 * 60 * 60 * 1000);

    const maxEndDate = new Date(startDateObj.getTime() + 60 * 24 * 60 * 60 * 1000);
    if (endDateObj > maxEndDate) endDateObj = maxEndDate;

    const scheduleWhere = {
      status: { [Op.notIn]: ['Cancelled', 'Completed', 'Inactive'] },
    };
    if (Array.isArray(schedule_ids) && schedule_ids.length > 0) {
      scheduleWhere.id = schedule_ids;
    }

    const masterSchedules = await Trip.findAll({ where: scheduleWhere });
    if (masterSchedules.length === 0) {
      return res.json({ success: true, message: 'No active master schedules found to generate trips', data: { created_count: 0, skipped_count: 0 } });
    }

    let createdCount = 0;
    let skippedCount = 0;
    const createdTrips = [];

    const curr = new Date(startDateObj);
    while (curr <= endDateObj) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      for (const master of masterSchedules) {
        if (master.valid_from && dateStr < master.valid_from) continue;
        if (master.valid_until && dateStr > master.valid_until) continue;

        if (!isOperatingDay(curr, master.operating_days)) {
          skippedCount++;
          continue;
        }

        const existing = await Trip.findOne({
          where: {
            [Op.or]: [
              { schedule_code: master.schedule_code, trip_date: dateStr },
              { route_id: master.route_id, departure_time: master.departure_time, trip_date: dateStr },
            ],
          },
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        const dailyTrip = await Trip.create({
          schedule_code: master.schedule_code,
          route_id: master.route_id,
          bus_type_id: master.bus_type_id,
          departure_time: master.departure_time,
          arrival_time: master.arrival_time,
          operating_days: master.operating_days,
          trip_date: dateStr,
          valid_from: master.valid_from,
          valid_until: master.valid_until,
          driver_id: master.driver_id,
          vehicle_id: master.vehicle_id,
          status: 'Scheduled',
          notes: master.notes ? `Generated from master schedule: ${master.notes}` : `Generated trip for ${dateStr}`,
        });

        createdCount++;
        createdTrips.push({ id: dailyTrip.id, schedule_code: dailyTrip.schedule_code, trip_date: dateStr, departure_time: dailyTrip.departure_time });
      }

      curr.setDate(curr.getDate() + 1);
    }

    res.json({
      success: true,
      message: `Generated ${createdCount} future trip instances (${skippedCount} skipped/existing)`,
      data: {
        created_count: createdCount,
        skipped_count: skippedCount,
        start_date: startDateObj.toISOString().split('T')[0],
        end_date: endDateObj.toISOString().split('T')[0],
        trips: createdTrips.slice(0, 50),
      },
    });
  } catch (err) {
    next(err);
  }
};

