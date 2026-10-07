'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShuttleFare = sequelize.define('ShuttleFare', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  from_stop_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  to_stop_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  fare: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  minimum_fare: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  currency: { type: DataTypes.STRING(10), defaultValue: 'INR' },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
}, {
  tableName: 'shuttle_fares',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ShuttleFare;
