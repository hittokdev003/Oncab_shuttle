'use strict';

const { Op } = require('sequelize');
const { OwnerApprovalRequest, AdminUser, Driver, Vehicle, Trip, sequelize } = require('../models');
const driverController = require('./driverController');
const vehicleController = require('./vehicleController');
const { hasRole } = require('../utils/roles');

const parsePayload = (request) => JSON.parse(request.payload);
const pickFields = (source, fields) => Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(source || {}, field)).map((field) => [field, source[field]]));

const invokeDriverHandler = (handler, req) => new Promise((resolve, reject) => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) {
      if (this.statusCode >= 400 || body?.success === false) {
        const error = new Error(body?.message || 'Unable to apply driver request');
        error.status = this.statusCode;
        reject(error);
        return this;
      }
      resolve(body);
      return this;
    },
  };
  handler(req, res, reject);
});

exports.create = async (req, res, next) => {
  try {
    if (!hasRole(req.user, 'owner')) {
      return res.status(403).json({ success: false, message: 'Only owners can submit fleet approval requests' });
    }
    const { request_type, target_id, payload } = req.body || {};
    if (!['driver_create', 'driver_update', 'vehicle_create', 'vehicle_update', 'trip_assignment'].includes(request_type) || !payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, message: 'A valid request_type and payload are required' });
    }

    let safePayload = {};
    if (request_type === 'driver_create' || request_type === 'driver_update') {
      if (request_type === 'driver_update') {
        const driver = await Driver.findByPk(target_id);
        if (!driver || Number(driver.owner_id) !== Number(req.user.id)) return res.status(403).json({ success: false, message: 'You can only request changes to your own drivers' });
      }
      safePayload = pickFields(payload, ['name', 'email', 'mobile', 'aadhar', 'pan', 'sex', 'address', 'status', 'aadhar_img', 'pan_img', 'details', 'is_bus_driver', 'preferred_bus_type_id']);
      safePayload.owner_id = req.user.id;
      if (request_type === 'driver_create') safePayload.status = 'Pending';
    } else if (request_type === 'vehicle_create' || request_type === 'vehicle_update') {
      if (request_type === 'vehicle_update') {
        const vehicle = await Vehicle.findByPk(target_id);
        if (!vehicle || Number(vehicle.owner_id) !== Number(req.user.id)) return res.status(403).json({ success: false, message: 'You can only request changes to your own vehicles' });
      }
      safePayload = pickFields(payload, ['driver_id', 'bus_type_id', 'registration_number', 'company_model', 'engine_type', 'color', 'total_seats', 'status', 'vehicle_img']);
      safePayload.owner_id = req.user.id;
      if (safePayload.driver_id) {
        const driver = await Driver.findOne({ where: { id: safePayload.driver_id, owner_id: req.user.id } });
        if (!driver) return res.status(403).json({ success: false, message: 'You can only assign drivers from your fleet' });
      }
      if (request_type === 'vehicle_create' && !safePayload.registration_number) return res.status(400).json({ success: false, message: 'registration_number is required' });
    } else {
      if (!(req.userPermissions || []).some((permission) => ['bookings.read', 'bookings.manage'].includes(permission))) {
        return res.status(403).json({ success: false, message: 'Booking access is required to request trip assignment changes' });
      }
      const assignmentFields = ['driver_id', 'vehicle_id'];
      if (!Object.keys(payload).some((field) => assignmentFields.includes(field)) || Object.keys(payload).some((field) => !assignmentFields.includes(field))) {
        return res.status(400).json({ success: false, message: 'Trip assignment requests may only change driver_id or vehicle_id' });
      }
      const trip = await Trip.findByPk(target_id);
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      let ownsCurrentAssignment = false;
      if (trip.driver_id) {
        const driver = await Driver.findByPk(trip.driver_id);
        ownsCurrentAssignment = Number(driver?.owner_id) === Number(req.user.id);
      }
      if (trip.vehicle_id) {
        const vehicle = await Vehicle.findByPk(trip.vehicle_id);
        ownsCurrentAssignment = ownsCurrentAssignment || Number(vehicle?.owner_id) === Number(req.user.id);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'driver_id') && payload.driver_id) {
        const driver = await Driver.findOne({ where: { id: payload.driver_id, owner_id: req.user.id } });
        if (!driver) return res.status(403).json({ success: false, message: 'You can only assign drivers from your fleet' });
        ownsCurrentAssignment = true;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'vehicle_id') && payload.vehicle_id) {
        const vehicle = await Vehicle.findOne({ where: { id: payload.vehicle_id, owner_id: req.user.id } });
        if (!vehicle) return res.status(403).json({ success: false, message: 'You can only assign vehicles from your fleet' });
        ownsCurrentAssignment = true;
      }
      if (!ownsCurrentAssignment) return res.status(403).json({ success: false, message: 'This trip is not assigned to your fleet' });
      safePayload = pickFields(payload, assignmentFields);
      for (const field of assignmentFields) {
        if (Object.prototype.hasOwnProperty.call(safePayload, field)) safePayload[field] = safePayload[field] ? Number(safePayload[field]) : null;
      }
    }

    const request = await OwnerApprovalRequest.create({
      owner_id: req.user.id,
      request_type,
      target_id: target_id || null,
      payload: JSON.stringify(safePayload),
    });
    return res.status(201).json({ success: true, message: 'Request sent to admin for approval', data: request });
  } catch (err) {
    next(err);
  }
};

exports.mine = async (req, res, next) => {
  try {
    if (!hasRole(req.user, 'owner')) {
      return res.status(403).json({ success: false, message: 'Owner role required' });
    }
    const requests = await OwnerApprovalRequest.findAll({
      where: { owner_id: req.user.id },
      order: [['created_at', 'DESC']],
    });
    res.json({ success: true, data: requests.map((request) => ({ ...request.toJSON(), payload: parsePayload(request) })) });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const requests = await OwnerApprovalRequest.findAll({
      where,
      include: [{ model: AdminUser, as: 'owner', attributes: ['id', 'name', 'email'] }],
      order: [['created_at', 'DESC']],
      limit: 200,
    });
    res.json({ success: true, data: requests.map((request) => ({ ...request.toJSON(), payload: parsePayload(request) })) });
  } catch (err) {
    next(err);
  }
};

exports.review = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    if (!hasRole(req.user, 'admin')) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Admin role required' });
    }
    const request = await OwnerApprovalRequest.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!request) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Approval request not found' });
    }
    if (request.status !== 'pending') {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: 'This request has already been reviewed' });
    }

    const decision = String(req.body?.decision || '').toLowerCase();
    if (!['approve', 'reject'].includes(decision)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'decision must be approve or reject' });
    }

    if (decision === 'approve') {
      const payload = parsePayload(request);
      if (request.request_type === 'driver_create' || request.request_type === 'driver_update') {
        if (request.request_type === 'driver_update') {
          const driver = await Driver.findByPk(request.target_id);
          if (!driver || Number(driver.owner_id) !== Number(request.owner_id)) {
            throw Object.assign(new Error('Requested driver is no longer in this owner fleet'), { status: 409 });
          }
        }
        payload.owner_id = request.owner_id;
        if (request.request_type === 'driver_create') payload.status = 'Pending';
        const innerReq = {
          ...req,
          body: payload,
          params: { id: request.target_id },
          approvalTransaction: transaction,
        };
        await invokeDriverHandler(
          request.request_type === 'driver_create' ? driverController.create : driverController.update,
          innerReq,
        );
      } else if (request.request_type === 'vehicle_create' || request.request_type === 'vehicle_update') {
        if (request.request_type === 'vehicle_update') {
          const vehicle = await Vehicle.findByPk(request.target_id, { transaction });
          if (!vehicle || Number(vehicle.owner_id) !== Number(request.owner_id)) {
            throw Object.assign(new Error('Requested vehicle is no longer in this owner fleet'), { status: 409 });
          }
        }
        payload.owner_id = request.owner_id;
        const innerReq = { ...req, body: payload, params: { id: request.target_id } };
        await invokeDriverHandler(
          request.request_type === 'vehicle_create' ? vehicleController.create : vehicleController.update,
          innerReq,
        );
      } else if (request.request_type === 'trip_assignment') {
        const trip = await Trip.findByPk(request.target_id, { transaction });
        if (!trip) throw Object.assign(new Error('Requested trip no longer exists'), { status: 404 });
        const updates = {};
        if (Object.prototype.hasOwnProperty.call(payload, 'driver_id')) {
          if (payload.driver_id) {
            const driver = await Driver.findByPk(payload.driver_id);
            if (!driver || Number(driver.owner_id) !== Number(request.owner_id)) {
              throw Object.assign(new Error('Requested driver is not in this owner fleet'), { status: 403 });
            }
          }
          updates.driver_id = payload.driver_id || null;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'vehicle_id')) {
          if (payload.vehicle_id) {
            const vehicle = await Vehicle.findByPk(payload.vehicle_id);
            if (!vehicle || Number(vehicle.owner_id) !== Number(request.owner_id)) {
              throw Object.assign(new Error('Requested vehicle is not in this owner fleet'), { status: 403 });
            }
            updates.vehicle_id = vehicle.id;
            updates.bus_type_id = vehicle.bus_type_id || null;
          } else {
            updates.vehicle_id = null;
            updates.bus_type_id = null;
          }
        }
        await trip.update(updates, { transaction });
      }
      request.status = 'approved';
    } else {
      request.status = 'rejected';
    }

    request.reviewed_by = req.user.id;
    request.reviewed_at = new Date();
    request.admin_note = req.body?.admin_note || null;
    await request.save({ transaction });
    await transaction.commit();

    res.json({
      success: true,
      message: decision === 'approve' ? 'Request approved and applied' : 'Request rejected',
      data: request,
    });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};
