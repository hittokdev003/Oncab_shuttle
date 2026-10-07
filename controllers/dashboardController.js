'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { Booking, Trip, Driver, Vehicle, Passenger, CustomerUser, Payment, Refund, Route, AuditLog, AdminUser } = require('../models');
const sequelize = require('../config/database');
const { hasRole } = require('../utils/roles');
const SeatReservationService = require('../services/seatReservationService');

const normalizeSeatIdentity = (seat) => {
  const numericSeat = seat.match(/^\d+$/);
  if (numericSeat) return `index:${Number(seat)}`;

  const rowFirst = seat.match(/^(\d+)([A-Z])$/);
  const letterFirst = seat.match(/^([A-Z])(\d+)$/);
  const row = rowFirst ? Number(rowFirst[1]) : letterFirst ? Number(letterFirst[2]) : null;
  const column = rowFirst ? rowFirst[2] : letterFirst ? letterFirst[1] : null;
  if (row && column) return `index:${(row - 1) * 4 + column.charCodeAt(0) - 64}`;
  return `label:${seat}`;
};

const getRevenuePeriod = (date, groupBy) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (groupBy === 'year') return String(year);
  if (groupBy === 'month') return `${year}-${month}`;
  if (groupBy === 'week') {
    const weekStart = new Date(year, date.getMonth(), date.getDate());
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  }
  return `${year}-${month}-${day}`;
};

const addMoney = (current, amount) => Math.round((current + amount + Number.EPSILON) * 100) / 100;

// ── Dashboard Stats ────────────────────────────────────────
exports.stats = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date(); thisMonth.setDate(1);
    const isAdmin = hasRole(req.user, 'admin');
    const isOwner = hasRole(req.user, 'owner');
    const ownerVehicleWhere = isOwner ? { owner_id: req.user.id } : {};
    const ownerDriverWhere = isOwner ? { owner_id: req.user.id } : {};
    const ownedVehicleRows = isOwner ? await Vehicle.findAll({ attributes: ['id'], where: ownerVehicleWhere, raw: true }) : [];
    const ownedDriverRows = isOwner ? await Driver.findAll({ attributes: ['id'], where: ownerDriverWhere, raw: true }) : [];
    const ownedVehicleIds = ownedVehicleRows.map((v) => v.id);
    const ownedDriverIds = ownedDriverRows.map((d) => d.id);
    const ownerTripWhere = isOwner
      ? { [Op.or]: [{ vehicle_id: { [Op.in]: ownedVehicleIds } }, { driver_id: { [Op.in]: ownedDriverIds } }] }
      : {};
    const ownerTripIds = isOwner
      ? (await Trip.findAll({ attributes: ['id'], where: ownerTripWhere, raw: true })).map((trip) => trip.id)
      : [];
    const ownerBookingWhere = isOwner ? { trip_id: { [Op.in]: ownerTripIds } } : {};
    const ownerBookingIds = isOwner
      ? (await Booking.findAll({ attributes: ['id'], where: ownerBookingWhere, raw: true })).map((booking) => booking.id)
      : [];
    const [
      totalTrips, todayTrips, activeTrips,
      totalBookings, todayBookings, confirmedBookings,
      totalDrivers, activeDrivers,
      totalVehicles, activeVehicles,
      totalPassengers,
      cancelledBookings,
    ] = await Promise.all([
      Trip.count({ where: ownerTripWhere }),
      Trip.count({ where: { ...ownerTripWhere, trip_date: today } }),
      Trip.count({ where: { ...ownerTripWhere, status: 'Active' } }),
      Booking.count({ where: ownerBookingWhere }),
      Booking.count({ where: { ...ownerBookingWhere, created_at: { [Op.gte]: new Date(today) } } }),
      Booking.count({ where: { ...ownerBookingWhere, booking_status: 'confirmed' } }),
      Driver.count({ where: ownerDriverWhere }),
      Driver.count({ where: { ...ownerDriverWhere, status: 'Approve', block_status: 'Unblock' } }),
      Vehicle.count({ where: ownerVehicleWhere }),
      Vehicle.count({ where: { ...ownerVehicleWhere, status: 'Active' } }),
      isOwner ? Booking.count({ distinct: true, col: 'passenger_id', where: ownerBookingWhere }) : Passenger.count(),
      Booking.count({ where: { ...ownerBookingWhere, booking_status: 'cancelled' } }),
    ]);

    // Bookings by status
    const bookingsByStatus = await Booking.findAll({
      attributes: ['booking_status', [fn('COUNT', col('id')), 'count']],
      where: ownerBookingWhere,
      group: ['booking_status'],
    });

    const vehicleStatusChart = await Vehicle.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      where: ownerVehicleWhere,
      group: ['status'],
      raw: true,
    });

    const driverStatusChart = await Driver.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      where: ownerDriverWhere,
      group: ['status'],
      raw: true,
    });

    const tripStatusChart = await Trip.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      where: ownerTripWhere,
      group: ['status'],
      raw: true,
    });

    // Recent bookings
    const recentBookings = await Booking.findAll({
      attributes: ['id', 'passenger_name', 'booking_reference', 'booking_status'],
      where: ownerBookingWhere,
      limit: 10,
      order: [['created_at', 'DESC']],
      include: [
        { model: Trip, as: 'trip', attributes: ['id', 'schedule_code'] },
        { model: CustomerUser, as: 'passenger', attributes: ['id', 'name', 'mobile'] },
      ],
      attributes: isAdmin
        ? ['id', 'passenger_name', 'booking_reference', 'booking_status', 'final_amount']
        : ['id', 'passenger_name', 'booking_reference', 'booking_status'],
    });

    let adminFinancialSummary = {};
    let revenueChart = [];
    if (isAdmin) {
      const [totalRevenue, todayRevenue, pendingRefunds, pendingRefundAmount, completedRefundAmount] = await Promise.all([
        Payment.sum('amount', { where: { status: 'captured' } }),
        Payment.sum('amount', { where: { status: 'captured', created_at: { [Op.gte]: new Date(today) } } }),
        Refund.count({ where: { status: 'pending' } }),
        Refund.sum('refund_amount', { where: { status: 'pending' } }),
        Refund.sum('refund_amount', { where: { status: 'completed' } }),
      ]);

      adminFinancialSummary = {
        revenue: { total: totalRevenue || 0, today: todayRevenue || 0 },
        refunds: { pending: pendingRefunds, pendingAmount: pendingRefundAmount || 0, completedAmount: completedRefundAmount || 0 },
      };

      revenueChart = await Payment.findAll({
        attributes: [
          [fn('DATE_FORMAT', col('created_at'), '%Y-%m'), 'month'],
          [fn('SUM', col('amount')), 'revenue'],
          [fn('COUNT', col('id')), 'transactions'],
        ],
        where: { status: 'captured', created_at: { [Op.gte]: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
        group: [literal('month')],
        order: [[literal('month'), 'ASC']],
      });
    }

    // Top routes
    const topRoutes = await Booking.findAll({
      attributes: ['trip_id', [fn('COUNT', col('Booking.id')), 'booking_count']],
      include: [{ model: Trip, as: 'trip', attributes: ['id', 'schedule_code'], include: [{ model: Route, as: 'route', attributes: ['id', 'route_name', 'origin_city', 'destination_city'] }] }],
      group: ['trip_id', 'trip.id', 'trip.schedule_code', 'trip.route.id', 'trip.route.route_name', 'trip.route.origin_city', 'trip.route.destination_city'],
      order: [[literal('booking_count'), 'DESC']],
      limit: 5,
      where: { ...ownerBookingWhere, booking_status: 'confirmed' },
    });

    res.json({
      success: true,
      data: {
        summary: {
          trips: { total: totalTrips, today: todayTrips, active: activeTrips },
          bookings: { total: totalBookings, today: todayBookings, confirmed: confirmedBookings, cancelled: cancelledBookings },
          drivers: { total: totalDrivers, active: activeDrivers },
          vehicles: { total: totalVehicles, active: activeVehicles },
          passengers: { total: totalPassengers },
          ...adminFinancialSummary,
        },
        charts: {
          ...(isAdmin ? { revenue: revenueChart } : {}),
          bookingsByStatus,
          vehicleStatus: vehicleStatusChart,
          driverStatus: driverStatusChart,
          tripStatus: tripStatusChart,
        },
        recentBookings,
        topRoutes,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Revenue Report ─────────────────────────────────────────
exports.revenueReport = async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;
    const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'monthly';
    const groupBy = ['day', 'week', 'month', 'year'].includes(req.query.group_by)
      ? req.query.group_by
      : period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'day';
    const isOwner = hasRole(req.user, 'owner');
    const isAdmin = hasRole(req.user, 'admin');
    const selectedOwnerId = isAdmin && req.query.owner_id ? Number(req.query.owner_id) : null;
    if (req.query.owner_id && isAdmin && (!Number.isInteger(selectedOwnerId) || selectedOwnerId < 1)) {
      return res.status(400).json({ success: false, message: 'owner_id must be a positive integer' });
    }

    const endDate = to_date ? new Date(`${to_date}T23:59:59.999`) : new Date();
    let startDate;
    if (from_date) {
      startDate = new Date(`${from_date}T00:00:00`);
    } else {
      startDate = new Date(endDate);
      if (period === 'daily') startDate.setDate(startDate.getDate() - 6);
      else if (period === 'weekly') startDate.setDate(startDate.getDate() - 27);
      else {
        startDate.setMonth(startDate.getMonth() - 5);
        startDate.setDate(1);
      }
    }
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return res.status(400).json({ success: false, message: 'A valid date range is required' });
    }

    let ownerTripIds = null;
    if (isOwner) {
      const [vehicles, drivers] = await Promise.all([
        Vehicle.findAll({ attributes: ['id'], where: { owner_id: req.user.id }, raw: true }),
        Driver.findAll({ attributes: ['id'], where: { owner_id: req.user.id }, raw: true }),
      ]);
      const vehicleIds = vehicles.map((vehicle) => vehicle.id);
      const driverIds = drivers.map((driver) => driver.id);
      const ownerTripWhere = vehicleIds.length || driverIds.length
        ? { [Op.or]: [
          ...(vehicleIds.length ? [{ vehicle_id: { [Op.in]: vehicleIds } }] : []),
          ...(driverIds.length ? [{ driver_id: { [Op.in]: driverIds } }] : []),
        ] }
        : { id: { [Op.in]: [] } };
      ownerTripIds = (await Trip.findAll({ attributes: ['id'], where: ownerTripWhere, raw: true })).map((trip) => trip.id);
    }

    const bookingWhere = {
      booking_status: { [Op.in]: ['confirmed', 'completed'] },
      created_at: { [Op.between]: [startDate, endDate] },
    };
    if (ownerTripIds) bookingWhere.trip_id = { [Op.in]: ownerTripIds };
    const bookings = await Booking.findAll({
      attributes: ['id', 'trip_id', 'travel_date', 'seat_numbers', 'total_seats', 'total_fare', 'discount_amount', 'final_amount', 'created_at'],
      where: bookingWhere,
      order: [['created_at', 'ASC'], ['id', 'ASC']],
    });

    const tripIds = [...new Set(bookings.map((booking) => Number(booking.trip_id)))];
    const trips = tripIds.length ? await Trip.findAll({
      attributes: ['id', 'route_id'],
      where: { id: { [Op.in]: tripIds } },
      include: [
        { model: Route, as: 'route', attributes: ['id', 'route_name'], required: false },
        { model: Vehicle, as: 'vehicle', attributes: ['id', 'owner_id'], required: false },
        { model: Driver, as: 'driver', attributes: ['id', 'owner_id'], required: false },
      ],
    }) : [];
    const tripById = new Map(trips.map((trip) => [Number(trip.id), trip]));
    const tripSeatGroups = new Map();
    for (const booking of bookings) {
      const trip = tripById.get(Number(booking.trip_id));
      if (!trip) continue;
      const vehicleOwnerId = trip.vehicle?.owner_id;
      const driverOwnerId = trip.driver?.owner_id;
      const ownerId = vehicleOwnerId || driverOwnerId || null;
      if (!ownerId || (isOwner && Number(ownerId) !== Number(req.user.id))) continue;

      const tripDateKey = `${Number(trip.id)}:${booking.travel_date}`;
      let group = tripSeatGroups.get(tripDateKey);
      if (!group) {
        group = { trip, ownerId: Number(ownerId), seats: new Map() };
        tripSeatGroups.set(tripDateKey, group);
      }
      const bookingDate = new Date(booking.created_at);
      const seatNumbers = SeatReservationService.parseSeatNumbers(booking.seat_numbers);
      const bookingSeatCount = seatNumbers.length || Math.max(1, Number(booking.total_seats) || 1);
      const storedFare = Number(booking.total_fare);
      const historicFare = Number.isFinite(storedFare) && storedFare > 0
        ? storedFare
        : Math.max(0, Number(booking.final_amount || 0) + Number(booking.discount_amount || 0));
      const farePerSeat = historicFare / bookingSeatCount;
      if (seatNumbers.length) {
        for (const seat of seatNumbers) {
          const identity = normalizeSeatIdentity(seat);
          if (!group.seats.has(identity)) group.seats.set(identity, { bookedAt: bookingDate, fare: farePerSeat });
        }
      } else {
        const fallbackSeatCount = Math.max(1, Number(booking.total_seats) || 1);
        for (let index = 0; index < fallbackSeatCount; index += 1) {
          group.seats.set(`booking:${booking.id}:${index}`, { bookedAt: bookingDate, fare: farePerSeat });
        }
      }
    }

    const periodTotals = new Map();
    const periodOwnerTotals = new Map();
    const ownerTotals = new Map();
    const routeTotals = new Map();
    for (const group of tripSeatGroups.values()) {
      const routeId = Number(group.trip.route_id);
      let ownerTotal = ownerTotals.get(group.ownerId);
      if (!ownerTotal) {
        ownerTotal = { owner_id: group.ownerId, owner_name: group.trip.vehicle?.owner?.name || group.trip.driver?.owner?.name || null, revenue: 0, distinct_seats: 0, trips: 0 };
        ownerTotals.set(group.ownerId, ownerTotal);
      }
      ownerTotal.trips += 1;
      ownerTotal.distinct_seats += group.seats.size;

      const routeKey = `${group.ownerId}:${routeId}`;
      let routeTotal = routeTotals.get(routeKey);
      if (!routeTotal) {
        routeTotal = {
          owner_id: group.ownerId,
          route_id: routeId,
          route_name: group.trip.route?.route_name || `Route #${routeId}`,
          fare_per_seat: 0,
          fare_total: 0,
          revenue: 0,
          distinct_seats: 0,
          trips: 0,
        };
        routeTotals.set(routeKey, routeTotal);
      }
      routeTotal.distinct_seats += group.seats.size;
      routeTotal.trips += 1;

      for (const seat of group.seats.values()) {
        ownerTotal.revenue = addMoney(ownerTotal.revenue, seat.fare);
        routeTotal.revenue = addMoney(routeTotal.revenue, seat.fare);
        routeTotal.fare_total = addMoney(routeTotal.fare_total, seat.fare);

        const periodKey = getRevenuePeriod(seat.bookedAt, groupBy);
        let periodTotal = periodTotals.get(periodKey);
        if (!periodTotal) {
          periodTotal = { period: periodKey, revenue: 0, distinct_seats: 0 };
          periodTotals.set(periodKey, periodTotal);
        }
        periodTotal.revenue = addMoney(periodTotal.revenue, seat.fare);
        periodTotal.distinct_seats += 1;

        const ownerPeriodKey = `${group.ownerId}:${periodKey}`;
        let ownerPeriodTotal = periodOwnerTotals.get(ownerPeriodKey);
        if (!ownerPeriodTotal) {
          ownerPeriodTotal = { owner_id: group.ownerId, period: periodKey, revenue: 0, distinct_seats: 0 };
          periodOwnerTotals.set(ownerPeriodKey, ownerPeriodTotal);
        }
        ownerPeriodTotal.revenue = addMoney(ownerPeriodTotal.revenue, seat.fare);
        ownerPeriodTotal.distinct_seats += 1;
      }
    }

    for (const routeTotal of routeTotals.values()) {
      routeTotal.fare_per_seat = routeTotal.distinct_seats
        ? Math.round((routeTotal.fare_total / routeTotal.distinct_seats + Number.EPSILON) * 100) / 100
        : 0;
      delete routeTotal.fare_total;
    }

    const ownerIds = [...ownerTotals.keys()];
    const owners = ownerIds.length ? await AdminUser.findAll({ attributes: ['id', 'name'], where: { id: { [Op.in]: ownerIds } }, raw: true }) : [];
    const ownerNames = new Map(owners.map((owner) => [Number(owner.id), owner.name]));
    const ownerBreakdown = [...ownerTotals.values()]
      .map((owner) => ({ ...owner, owner_name: ownerNames.get(owner.owner_id) || `Owner #${owner.owner_id}` }))
      .sort((a, b) => b.revenue - a.revenue);
    const filteredOwners = selectedOwnerId
      ? ownerBreakdown.filter((owner) => owner.owner_id === selectedOwnerId)
      : ownerBreakdown;
    const routeBreakdown = [...routeTotals.values()]
      .filter((route) => !selectedOwnerId || route.owner_id === selectedOwnerId)
      .sort((a, b) => b.revenue - a.revenue);
    const report = [...periodTotals.values()].sort((a, b) => a.period.localeCompare(b.period));
    const total = filteredOwners.reduce((sum, owner) => sum + owner.revenue, 0);
    const distinctSeats = filteredOwners.reduce((sum, owner) => sum + owner.distinct_seats, 0);
    const filteredReport = selectedOwnerId
      ? [...periodOwnerTotals.values()]
        .filter((row) => row.owner_id === selectedOwnerId)
        .map(({ period, revenue, distinct_seats }) => ({ period, revenue, distinct_seats }))
        .sort((a, b) => a.period.localeCompare(b.period))
      : report;

    res.json({ success: true, data: {
      report: filteredReport,
      total,
      distinct_seats: distinctSeats,
      owner_breakdown: filteredOwners,
      owner_options: ownerBreakdown.map(({ owner_id, owner_name }) => ({ owner_id, owner_name })),
      route_breakdown: routeBreakdown,
    } });
  } catch (err) {
    next(err);
  }
};

// ── Audit Logs ─────────────────────────────────────────────
exports.auditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, module, action, user_id, from_date, to_date } = req.query;
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const where = {};
    if (module) where.module = module;
    if (action) where.action = action;
    if (user_id) where.user_id = user_id;
    if (from_date && to_date) where.created_at = { [Op.between]: [new Date(from_date), new Date(to_date + ' 23:59:59')] };

    const { count, rows } = await AuditLog.findAndCountAll({ where, offset: (p - 1) * l, limit: l, order: [['created_at', 'DESC']] });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: l, pages: Math.ceil(count / l) } });
  } catch (err) {
    next(err);
  }
};
