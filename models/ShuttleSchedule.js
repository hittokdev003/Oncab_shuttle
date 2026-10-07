'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShuttleSchedule = sequelize.define('ShuttleSchedule', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  vehicle_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  schedule_date: { type: DataTypes.DATEONLY, defaultValue: null },
  day_of_week: { type: DataTypes.STRING(100), defaultValue: null },
  departure_time: { type: DataTypes.TIME, allowNull: false },
  arrival_time: { type: DataTypes.TIME, defaultValue: null },
  total_seats: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 20 },
  available_seats: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 20 },
  status: { type: DataTypes.ENUM('active', 'inactive', 'cancelled'), defaultValue: 'active' },
}, {
  tableName: 'shuttle_schedules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ShuttleSchedule;
