'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShuttleVehicle = sequelize.define('ShuttleVehicle', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  vehicle_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  vehicle_type: { type: DataTypes.STRING(100), defaultValue: 'Shuttle Bus' },
  route_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  capacity: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 20 },
  status: { type: DataTypes.ENUM('active', 'inactive', 'maintenance'), defaultValue: 'active' },
  latitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
  longitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
}, {
  tableName: 'shuttle_vehicles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ShuttleVehicle;
