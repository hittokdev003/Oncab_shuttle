'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShuttleRouteStop = sequelize.define('ShuttleRouteStop', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  stop_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  stop_sequence: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  arrival_offset_minutes: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  departure_offset_minutes: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  distance_from_previous_km: { type: DataTypes.DECIMAL(8, 2), defaultValue: 0.00 },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
}, {
  tableName: 'shuttle_route_stops',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ShuttleRouteStop;
