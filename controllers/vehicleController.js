'use strict';

const { Op } = require('sequelize');
const { Vehicle, VehicleDocument, Driver, BusType, OwnerApprovalRequest } = require('../models');
const { logAction } = require('../middleware/auditLog');
const { saveBase64File, deleteFile, getImageUrl } = require('../utils/fileUpload');
const { hasRole } = require('../utils/roles');

const serializeVehicle = (vehicle) => {
  const data = vehicle.toJSON();
  data.vehicle_img = getImageUrl(data.vehicle_img);
  data.rc_certificate_img = getImageUrl(data.rc_certificate_img);
  if (data.documents) {
    data.documents = data.documents.map((document) => ({
      ...document,
      doc_img: getImageUrl(document.doc_img),
    }));
  }
  return data;
};

const serializeDocument = (document) => {
  const data = document.toJSON();
  data.doc_img = getImageUrl(data.doc_img);
  return data;
};

const isUniqueConstraintError = (err) => err.name === 'SequelizeUniqueConstraintError';

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

const isOwnerRole = (req) => hasRole(req.user, 'owner');

const forceOwnerScope = (req, where = {}) => {
  if (!isOwnerRole(req)) return where;
  return { ...where, owner_id: req.user.id };
};

const ownerVehiclePayload = (body) => {
  const fields = ['driver_id', 'bus_type_id', 'registration_number', 'company_model', 'engine_type', 'color', 'total_seats', 'status', 'vehicle_img'];
  return Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(body, field)).map((field) => [field, body[field]]));
};

const validateOwnerDriver = async (req, driverId) => {
  if (!driverId) return true;
  return Boolean(await Driver.findOne({ where: { id: driverId, owner_id: req.user.id } }));
};

// ── List Vehicles ──────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = {};
    if (search) {
      where[Op.or] = [
        { registration_number: { [Op.like]: `%${search}%` } },
        { company_model: { [Op.like]: `%${search}%` } },
      ];
    }
    if (status) where.status = status;
    const ownerScopedWhere = forceOwnerScope(req, where);

    const { count, rows } = await Vehicle.findAndCountAll({
      where: ownerScopedWhere,
      include: [
        {
          model: Driver,
          as: 'driver',
          attributes: ['id', 'name', 'mobile'],
          ...(isOwnerRole(req) ? { where: { owner_id: req.user.id }, required: false } : {}),
        },
        { model: BusType, as: 'bus_type', attributes: ['id', 'name', 'code'] },
        { model: VehicleDocument, as: 'documents' },
      ],
      offset, limit: lim,
      order: [['created_at', 'DESC']],
    });

    res.json({ success: true, data: rows.map(serializeVehicle), pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) {
    next(err);
  }
};

// ── Get Vehicle ────────────────────────────────────────────
exports.show = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findByPk(req.params.id, {
      include: [
        {
          model: Driver,
          as: 'driver',
          ...(isOwnerRole(req) ? { where: { owner_id: req.user.id }, required: false } : {}),
        },
        { model: BusType, as: 'bus_type' },
        { model: VehicleDocument, as: 'documents' },
      ],
    });
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (isOwnerRole(req) && Number(vehicle.owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only view your own vehicles' });
    }
    res.json({ success: true, data: serializeVehicle(vehicle) });
  } catch (err) {
    next(err);
  }
};

// ── Create Vehicle ─────────────────────────────────────────
exports.create = async (req, res, next) => {
  let uploadedImage;
  try {
    const payload = { ...req.body };
    if (isOwnerRole(req)) {
      const ownerPayload = ownerVehiclePayload(req.body);
      if (!ownerPayload.registration_number) {
        return res.status(400).json({ success: false, message: 'Registration number is required' });
      }
      if (!await validateOwnerDriver(req, ownerPayload.driver_id)) return res.status(403).json({ success: false, message: 'You can only assign drivers from your fleet' });
      ownerPayload.owner_id = req.user.id;
      const request = await OwnerApprovalRequest.create({ owner_id: req.user.id, request_type: 'vehicle_create', payload: JSON.stringify(ownerPayload) });
      return res.status(202).json({ success: true, message: 'Vehicle request sent to admin for approval', data: request });
    }
    if (typeof payload.vehicle_img === 'string' && payload.vehicle_img.startsWith('data:')) {
      uploadedImage = saveBase64File(payload.vehicle_img, 'vehicles', 'vehicle');
      payload.vehicle_img = uploadedImage;
    }
    const vehicle = await Vehicle.create(payload);
    await logAction({ userId: req.user?.id, userType: req.user?.role?.name, userName: req.user?.name, action: 'create', module: 'vehicles', entityType: 'Vehicle', entityId: vehicle.id, newValues: req.body, ipAddress: req.ip, description: `Created vehicle ${vehicle.registration_number}` });
    res.status(201).json({ success: true, message: 'Vehicle created', data: serializeVehicle(vehicle) });
  } catch (err) {
    if (uploadedImage) deleteFile(uploadedImage);
    next(err);
  }
};

// ── Update Vehicle ─────────────────────────────────────────
exports.update = async (req, res, next) => {
  let uploadedImage;
  try {
    const vehicle = await Vehicle.findByPk(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (isOwnerRole(req) && Number(vehicle.owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only edit your own vehicles' });
    }
    const payload = { ...req.body };
    if (isOwnerRole(req)) {
      const ownerPayload = { ...ownerVehiclePayload(req.body), owner_id: req.user.id };
      if (Object.prototype.hasOwnProperty.call(ownerPayload, 'driver_id') && !await validateOwnerDriver(req, ownerPayload.driver_id)) {
        return res.status(403).json({ success: false, message: 'You can only assign drivers from your fleet' });
      }
      const request = await OwnerApprovalRequest.create({ owner_id: req.user.id, request_type: 'vehicle_update', target_id: vehicle.id, payload: JSON.stringify(ownerPayload) });
      return res.status(202).json({ success: true, message: 'Vehicle update sent to admin for approval', data: request });
    }
    const oldImage = vehicle.vehicle_img;
    if (typeof payload.vehicle_img === 'string' && payload.vehicle_img.startsWith('data:')) {
      uploadedImage = saveBase64File(payload.vehicle_img, 'vehicles', `vehicle_${vehicle.id}`);
      payload.vehicle_img = uploadedImage;
    } else delete payload.vehicle_img;
    await vehicle.update(payload);
    if (uploadedImage && oldImage && oldImage !== uploadedImage) deleteFile(oldImage);
    res.json({ success: true, message: 'Vehicle updated', data: serializeVehicle(vehicle) });
  } catch (err) {
    if (uploadedImage) deleteFile(uploadedImage);
    next(err);
  }
};

// ── Delete Vehicle ─────────────────────────────────────────
exports.destroy = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findByPk(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (isOwnerRole(req) && Number(vehicle.owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only delete your own vehicles' });
    }
    await vehicle.destroy();
    res.json({ success: true, message: 'Vehicle deleted' });
  } catch (err) {
    next(err);
  }
};

// ── Add Document ───────────────────────────────────────────
exports.addDocument = async (req, res, next) => {
  let uploadedImage;
  try {
    const vehicle = await Vehicle.findByPk(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (isOwnerRole(req) && Number(vehicle.owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only manage documents for your own vehicles' });
    }
    const existing = await VehicleDocument.findOne({ where: { vehicle_id: vehicle.id, doc_type: req.body.doc_type } });
    if (existing) {
      return res.status(409).json({ success: false, message: `A ${req.body.doc_type} document already exists for this vehicle` });
    }
    const payload = { ...req.body, vehicle_id: vehicle.id };
    if (typeof payload.doc_img === 'string' && payload.doc_img.startsWith('data:')) {
      uploadedImage = saveBase64File(payload.doc_img, `vehicles/${vehicle.id}/documents`, payload.doc_type);
      payload.doc_img = uploadedImage;
    }
    const doc = await VehicleDocument.create(payload);
    res.status(201).json({ success: true, message: 'Document added', data: serializeDocument(doc) });
  } catch (err) {
    if (uploadedImage) deleteFile(uploadedImage);
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ success: false, message: `A ${req.body.doc_type} document already exists for this vehicle` });
    }
    next(err);
  }
};

// ── Update Document ────────────────────────────────────────
exports.updateDocument = async (req, res, next) => {
  let uploadedImage;
  try {
    const vehicle = await Vehicle.findByPk(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (isOwnerRole(req) && Number(vehicle.owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only manage documents for your own vehicles' });
    }
    const document = await VehicleDocument.findOne({
      where: { id: req.params.documentId, vehicle_id: req.params.id },
    });
    if (!document) return res.status(404).json({ success: false, message: 'Vehicle document not found' });

    const nextType = req.body.doc_type || document.doc_type;
    const existing = await VehicleDocument.findOne({
      where: { vehicle_id: document.vehicle_id, doc_type: nextType, id: { [Op.ne]: document.id } },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: `A ${nextType} document already exists for this vehicle` });
    }

    const payload = { ...req.body };
    const oldImage = document.doc_img;
    if (typeof payload.doc_img === 'string' && payload.doc_img.startsWith('data:')) {
      uploadedImage = saveBase64File(payload.doc_img, `vehicles/${document.vehicle_id}/documents`, payload.doc_type || document.doc_type);
      payload.doc_img = uploadedImage;
    } else delete payload.doc_img;
    await document.update(payload);
    if (uploadedImage && oldImage && oldImage !== uploadedImage) deleteFile(oldImage);
    res.json({ success: true, message: 'Document updated', data: serializeDocument(document) });
  } catch (err) {
    if (uploadedImage) deleteFile(uploadedImage);
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ success: false, message: `A ${req.body.doc_type} document already exists for this vehicle` });
    }
    next(err);
  }
};

// ── Expiring Documents ─────────────────────────────────────
exports.expiringDocuments = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + parseInt(days));
    const docs = await VehicleDocument.findAll({
      where: { expiry_date: { [Op.between]: [new Date(), threshold] } },
      include: [{
        model: Vehicle,
        as: 'vehicle',
        attributes: ['id', 'owner_id', 'registration_number', 'company_model'],
        ...(isOwnerRole(req) ? { where: { owner_id: req.user.id }, required: true } : {}),
      }],
      order: [['expiry_date', 'ASC']],
    });
    res.json({ success: true, data: docs });
  } catch (err) {
    next(err);
  }
};

// ── List Bus Types ─────────────────────────────────────────
exports.listBusTypes = async (req, res, next) => {
  try {
    const busTypes = await BusType.findAll({
      where: { status: 'Active' },
      order: [['name', 'ASC']],
    });
    res.json({ success: true, data: busTypes });
  } catch (err) {
    next(err);
  }
};
