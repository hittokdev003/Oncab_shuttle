'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShuttleScheduleStop = sequelize.define('ShuttleScheduleStop', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  schedule_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  route_stop_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  arrival_time: { type: DataTypes.TIME, allowNull: false },
  departure_time: { type: DataTypes.TIME, allowNull: false },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
}, {
  tableName: 'shuttle_schedule_stops',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ShuttleScheduleStop;
