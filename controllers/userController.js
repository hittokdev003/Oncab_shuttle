'use strict';

const { Op } = require('sequelize');
const { AdminUser, Role, Permission } = require('../models');
const { logAction } = require('../middleware/auditLog');

const ADMIN_ROLE_ID = 1;

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

// ── List Users ─────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page, limit, search, role_id, is_active } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }
    if (role_id) {
      const parsedRoleId = Number(role_id);
      if (parsedRoleId === ADMIN_ROLE_ID) {
        return res.status(403).json({ success: false, message: 'Admin role cannot be used in user filters' });
      }
      where.role_id = parsedRoleId;
    } else {
      where.role_id = { [Op.ne]: ADMIN_ROLE_ID };
    }
    if (is_active !== undefined) where.is_active = is_active === 'true';

    const { count, rows } = await AdminUser.findAndCountAll({
      where,
      include: [{ model: Role, as: 'role' }],
      offset,
      limit: lim,
      order: [['created_at', 'DESC']],
      paranoid: true,
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Get Single User ────────────────────────────────────────
exports.show = async (req, res, next) => {
  try {
    const user = await AdminUser.findByPk(req.params.id, {
      include: [{ model: Role, as: 'role', include: [{ model: Permission, as: 'permissions' }] }],
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ── Create User ────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { name, email, password, phone, role_id } = req.body;
    const exists = await AdminUser.findOne({ where: { email } });
    if (exists) return res.status(409).json({ success: false, message: 'Email already in use' });

    const role = await Role.findByPk(role_id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (Number(role.id) === ADMIN_ROLE_ID) return res.status(403).json({ success: false, message: 'Admin role cannot be assigned to a user' });

    const user = await AdminUser.create({ name, email, password, phone, role_id });

    await logAction({
      userId: req.user?.id,
      userType: req.user?.role?.name,
      userName: req.user?.name,
      action: 'create',
      module: 'users',
      entityType: 'AdminUser',
      entityId: user.id,
      newValues: { name, email, role_id },
      ipAddress: req.ip,
      description: `Created admin user ${name}`,
    });

    const created = await AdminUser.findByPk(user.id, { include: [{ model: Role, as: 'role' }] });
    res.status(201).json({ success: true, message: 'User created successfully', data: created });
  } catch (err) {
    next(err);
  }
};

// ── Update User ────────────────────────────────────────────
exports.update = async (req, res, next) => {
  try {
    const user = await AdminUser.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const oldValues = user.toJSON();
    const { name, email, phone, role_id, is_active } = req.body;
    if (role_id !== undefined && Number(role_id) === ADMIN_ROLE_ID) {
      return res.status(403).json({ success: false, message: 'Admin role cannot be assigned to a user' });
    }
    await user.update({ name, email, phone, role_id, is_active });

    await logAction({
      userId: req.user?.id,
      userType: req.user?.role?.name,
      userName: req.user?.name,
      action: 'update',
      module: 'users',
      entityType: 'AdminUser',
      entityId: user.id,
      oldValues,
      newValues: req.body,
      ipAddress: req.ip,
      description: `Updated admin user ${user.name}`,
    });

    const updated = await AdminUser.findByPk(user.id, { include: [{ model: Role, as: 'role' }] });
    res.json({ success: true, message: 'User updated successfully', data: updated });
  } catch (err) {
    next(err);
  }
};

// ── Delete User ────────────────────────────────────────────
exports.destroy = async (req, res, next) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }
    const user = await AdminUser.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (Number(user.role_id) === ADMIN_ROLE_ID) {
      return res.status(403).json({ success: false, message: 'Admin user cannot be deleted' });
    }

    await user.destroy();
    await logAction({
      userId: req.user?.id,
      userType: req.user?.role?.name,
      userName: req.user?.name,
      action: 'delete',
      module: 'users',
      entityType: 'AdminUser',
      entityId: user.id,
      ipAddress: req.ip,
      description: `Deleted admin user ${user.name}`,
    });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Toggle Active Status ───────────────────────────────────
exports.toggleStatus = async (req, res, next) => {
  try {
    const user = await AdminUser.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (Number(user.role_id) === ADMIN_ROLE_ID) {
      return res.status(403).json({ success: false, message: 'Admin user status cannot be changed from this panel' });
    }
    await user.update({ is_active: !user.is_active });
    res.json({ success: true, message: `User ${user.is_active ? 'activated' : 'deactivated'}`, data: { is_active: user.is_active } });
  } catch (err) {
    next(err);
  }
};
