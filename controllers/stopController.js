'use strict';

const { Op, Sequelize } = require('sequelize');
const { Stop, Route, RouteStop, sequelize } = require('../models');
const { logAction } = require('../middleware/auditLog');

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

const calcHaversineMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371000; // meters
  const dLat = (parseFloat(lat2) - parseFloat(lat1)) * Math.PI / 180;
  const dLon = (parseFloat(lon2) - parseFloat(lon1)) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(parseFloat(lat1) * Math.PI / 180) * Math.cos(parseFloat(lat2) * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

// ── 1. List All Physical Stops (Master View) ──────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = {};
    if (search) {
      where[Op.or] = [
        { stop_name: { [Op.like]: `%${search}%` } },
        { stop_code: { [Op.like]: `%${search}%` } },
        { address: { [Op.like]: `%${search}%` } },
        { landmark: { [Op.like]: `%${search}%` } },
      ];
    }
    if (status) where.status = status;

    const { count, rows } = await Stop.findAndCountAll({
      where,
      include: [
        {
          model: RouteStop,
          as: 'route_stops',
          include: [{ model: Route, as: 'route', attributes: ['id', 'route_name', 'route_code'] }],
        },
      ],
      distinct: true,
      offset,
      limit: lim,
      order: [['stop_name', 'ASC']],
    });

    const formattedData = rows.map((stop) => {
      const item = stop.toJSON();
      const routesCount = (item.route_stops || []).length;
      return {
        id: item.id,
        stop_name: item.stop_name,
        stop_code: item.stop_code,
        latitude: item.latitude ? parseFloat(item.latitude) : null,
        longitude: item.longitude ? parseFloat(item.longitude) : null,
        address: item.address,
        landmark: item.landmark,
        status: item.status,
        usage_count: routesCount,
        routes: (item.route_stops || []).map((rs) => rs.route).filter(Boolean),
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    res.json({
      success: true,
      data: formattedData,
      pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) },
    });
  } catch (err) {
    next(err);
  }
};

// ── 2. Search Existing Stops (Autosuggest for Route Editor) ───────────
exports.search = async (req, res, next) => {
  try {
    const q = req.query.q || req.query.query || req.query.search || '';
    if (!q || String(q).trim().length === 0) {
      return res.json({ success: true, data: [] });
    }

    const stops = await Stop.findAll({
      where: {
        status: 'Active',
        [Op.or]: [
          { stop_name: { [Op.like]: `%${q}%` } },
          { stop_code: { [Op.like]: `%${q}%` } },
          { address: { [Op.like]: `%${q}%` } },
        ],
      },
      include: [
        {
          model: RouteStop,
          as: 'route_stops',
          include: [{ model: Route, as: 'route', attributes: ['id', 'route_name', 'route_code'] }],
        },
      ],
      limit: 20,
    });

    const formatted = stops.map((stop) => {
      const item = stop.toJSON();
      const routesCount = (item.route_stops || []).length;
      return {
        stop_id: item.id,
        id: item.id,
        stop_name: item.stop_name,
        name: item.stop_name,
        stop_code: item.stop_code,
        latitude: item.latitude ? parseFloat(item.latitude) : null,
        longitude: item.longitude ? parseFloat(item.longitude) : null,
        address: item.address,
        landmark: item.landmark,
        usage_count: routesCount,
        display_label: `${item.stop_name} (${item.latitude}, ${item.longitude}) - Used by ${routesCount} route(s)`,
        routes: (item.route_stops || []).map((rs) => rs.route).filter(Boolean),
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

// ── 3. Proximity Nearby Check (Prevent Duplicate Stops) ─────────────────
exports.nearbyCheck = async (req, res, next) => {
  try {
    const latitude = parseFloat(req.query.latitude || req.query.lat);
    const longitude = parseFloat(req.query.longitude || req.query.lng);
    const radiusMeters = parseInt(req.query.radius || 100) || 100; // default 100 meters

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ success: false, message: 'Valid latitude and longitude are required' });
    }

    const allStops = await Stop.findAll({
      where: { status: 'Active' },
      attributes: ['id', 'stop_name', 'stop_code', 'latitude', 'longitude', 'address'],
    });

    const nearbyStops = [];
    allStops.forEach((stop) => {
      const dist = calcHaversineMeters(latitude, longitude, stop.latitude, stop.longitude);
      if (dist <= radiusMeters) {
        nearbyStops.push({
          stop_id: stop.id,
          id: stop.id,
          stop_name: stop.stop_name,
          stop_code: stop.stop_code,
          latitude: parseFloat(stop.latitude),
          longitude: parseFloat(stop.longitude),
          address: stop.address,
          distance_meters: dist,
          message: `${dist}m away from location`,
        });
      }
    });

    nearbyStops.sort((a, b) => a.distance_meters - b.distance_meters);

    res.json({
      success: true,
      has_nearby: nearbyStops.length > 0,
      message: nearbyStops.length > 0 ? 'An existing stop is nearby.' : 'No nearby stops found.',
      data: nearbyStops,
    });
  } catch (err) {
    next(err);
  }
};

// ── 4. Get Stop Details + Routes Using Stop ────────────────────────────
exports.show = async (req, res, next) => {
  try {
    const stop = await Stop.findByPk(req.params.id, {
      include: [
        {
          model: RouteStop,
          as: 'route_stops',
          include: [{ model: Route, as: 'route' }],
        },
      ],
    });

    if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });

    const item = stop.toJSON();
    const routesUsingStop = (item.route_stops || []).map((rs) => ({
      route_id: rs.route?.id,
      route_code: rs.route?.route_code,
      route_name: rs.route?.route_name,
      origin_city: rs.route?.origin_city,
      destination_city: rs.route?.destination_city,
      stop_sequence: rs.stop_sequence,
      pickup_allowed: rs.pickup_allowed,
      dropoff_allowed: rs.dropoff_allowed,
    })).filter((r) => r.route_id);

    res.json({
      success: true,
      data: {
        id: item.id,
        stop_name: item.stop_name,
        stop_code: item.stop_code,
        latitude: item.latitude ? parseFloat(item.latitude) : null,
        longitude: item.longitude ? parseFloat(item.longitude) : null,
        address: item.address,
        landmark: item.landmark,
        status: item.status,
        usage_count: routesUsingStop.length,
        routes: routesUsingStop,
        created_at: item.created_at,
        updated_at: item.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 5. Create Physical Stop ────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { stop_name, stop_code, latitude, longitude, address, landmark, status } = body;
    if (!stop_name) {
      return res.status(400).json({ success: false, message: 'stop_name is required' });
    }

    let targetRouteId = body.route_id ? parseInt(body.route_id) : null;
    if (!targetRouteId) {
      const firstRoute = await Route.findOne({ attributes: ['id'] });
      targetRouteId = firstRoute ? firstRoute.id : 1;
    }

    const stop = await Stop.create({
      route_id: targetRouteId,
      stop_name: String(stop_name).trim(),
      stop_code: stop_code ? String(stop_code).trim() : null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      address: address || null,
      landmark: landmark || null,
      status: status || 'Active',
    });

    await logAction({
      userId: req.user?.id,
      userType: req.user?.role?.name,
      userName: req.user?.name,
      action: 'create',
      module: 'stops',
      entityType: 'Stop',
      entityId: stop.id,
      newValues: { stop_name, latitude, longitude },
      ipAddress: req.ip,
      description: `Created physical stop ${stop_name}`,
    });

    res.status(201).json({ success: true, message: 'Physical stop created successfully', data: stop });
  } catch (err) {
    next(err);
  }
};

// ── 6. Update Physical Stop ────────────────────────────────────────────
exports.update = async (req, res, next) => {
  try {
    const stop = await Stop.findByPk(req.params.id);
    if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });

    const body = req.body || {};
    const { stop_name, stop_code, latitude, longitude, address, landmark, status } = body;
    await stop.update({
      ...(stop_name && { stop_name: String(stop_name).trim() }),
      ...(stop_code !== undefined && { stop_code: stop_code ? String(stop_code).trim() : null }),
      ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
      ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
      ...(address !== undefined && { address: address || null }),
      ...(landmark !== undefined && { landmark: landmark || null }),
      ...(status && { status }),
    });

    res.json({ success: true, message: 'Stop updated successfully', data: stop });
  } catch (err) {
    next(err);
  }
};

// ── 7. Deactivate Physical Stop ─────────────────────────────────────────
exports.destroy = async (req, res, next) => {
  try {
    const stop = await Stop.findByPk(req.params.id);
    if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });

    await stop.update({ status: 'Inactive' });
    res.json({ success: true, message: 'Stop deactivated successfully' });
  } catch (err) {
    next(err);
  }
};
