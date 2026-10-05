'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { Booking, Trip, Driver, Vehicle, Passenger, CustomerUser, Payment, Refund, Route, AuditLog } = require('../models');
const sequelize = require('../config/database');

// ── Dashboard Stats ────────────────────────────────────────
exports.stats = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date(); thisMonth.setDate(1);
    const isAdmin = req.user?.role?.name === 'admin';
    const isOwner = req.user?.role?.name === 'owner';
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
    const { from_date, to_date, group_by = 'day' } = req.query;
    const format = group_by === 'month' ? '%Y-%m' : group_by === 'year' ? '%Y' : '%Y-%m-%d';
    const where = { status: 'captured' };
    if (from_date && to_date) where.created_at = { [Op.between]: [new Date(from_date), new Date(to_date + ' 23:59:59')] };

    const data = await Payment.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('created_at'), format), 'period'],
        [fn('SUM', col('amount')), 'revenue'],
        [fn('COUNT', col('id')), 'transactions'],
      ],
      where,
      group: [literal('period')],
      order: [[literal('period'), 'ASC']],
    });

    const total = data.reduce((acc, r) => acc + parseFloat(r.get('revenue') || 0), 0);
    res.json({ success: true, data: { report: data, total } });
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
