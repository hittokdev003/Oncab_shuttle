'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CouponUsage = sequelize.define('CouponUsage', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  coupon_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  booking_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
  passenger_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  device_id: { type: DataTypes.STRING(191), allowNull: true },
  discount_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, {
  tableName: 'coupon_usages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = CouponUsage;