'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShuttleStop = sequelize.define('ShuttleStop', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  stop_name: { type: DataTypes.STRING(255), allowNull: false },
  stop_code: { type: DataTypes.STRING(50), defaultValue: null },
  address: { type: DataTypes.TEXT, defaultValue: null },
  latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
  longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
  landmark: { type: DataTypes.STRING(255), defaultValue: null },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
}, {
  tableName: 'shuttle_stops',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ShuttleStop;
