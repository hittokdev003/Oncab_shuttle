'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Stop = sequelize.define('Stop', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
  stop_name: { type: DataTypes.STRING(150), allowNull: false },
  stop_code: { type: DataTypes.STRING(30), defaultValue: null },
  stop_sequence: { type: DataTypes.INTEGER, defaultValue: 0 },
  latitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
  longitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
  address: { type: DataTypes.TEXT, defaultValue: null },
  landmark: { type: DataTypes.STRING(200), defaultValue: null },
  status: { type: DataTypes.ENUM('Active', 'Inactive'), defaultValue: 'Active' },
}, {
  tableName: 'stops',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Stop;
