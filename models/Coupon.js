'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Coupon = sequelize.define('Coupon', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  created_by: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  code_type: { type: DataTypes.ENUM('FLAT', 'PERCENTAGE'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  min_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  max_discount: { type: DataTypes.DECIMAL(10, 2), defaultValue: null },
  start_date: { type: DataTypes.DATEONLY, defaultValue: null },
  end_date: { type: DataTypes.DATEONLY, defaultValue: null },
  usage_limit: { type: DataTypes.INTEGER, defaultValue: null },
  used_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  per_user_limit: { type: DataTypes.INTEGER, defaultValue: 1 },
  per_device_limit: { type: DataTypes.INTEGER, defaultValue: null },
  max_seats: { type: DataTypes.INTEGER, defaultValue: null },
  description: { type: DataTypes.TEXT, defaultValue: null },
  applicable_to: { type: DataTypes.ENUM('All', 'Route', 'Pass'), defaultValue: 'All' },
  route_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  status: { type: DataTypes.ENUM('Active', 'Inactive', 'Expired'), defaultValue: 'Active' },
  deleted_at: { type: DataTypes.DATE, defaultValue: null },
}, {
  tableName: 'coupons',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = Coupon;
