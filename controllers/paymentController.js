'use strict';

const { Op } = require('sequelize');
const { Payment, Booking, CustomerUser } = require('../models');

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

exports.list = async (req, res, next) => {
  try {
    const { page, limit, status, payment_gateway, from_date, to_date } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = {};
    if (status) where.status = status;
    if (payment_gateway) where.payment_gateway = payment_gateway;
    if (from_date && to_date) where.created_at = { [Op.between]: [new Date(from_date), new Date(to_date + ' 23:59:59')] };

    const { count, rows } = await Payment.findAndCountAll({
      where,
      include: [
        { model: Booking, as: 'booking', attributes: ['id', 'booking_reference', 'passenger_name'] },
        { model: CustomerUser, as: 'passenger', attributes: ['id', 'name', 'mobile'] },
      ],
      offset, limit: lim,
      order: [['created_at', 'DESC']],
    });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) { next(err); }
};

exports.show = async (req, res, next) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [
        { model: Booking, as: 'booking' },
        { model: CustomerUser, as: 'passenger' },
      ],
    });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: payment });
  } catch (err) { next(err); }
};
