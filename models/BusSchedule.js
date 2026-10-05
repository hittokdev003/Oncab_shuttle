'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BusSchedule = sequelize.define('BusSchedule', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  bus_type_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  schedule_code: { type: DataTypes.STRING(50), allowNull: false },
  bus_number: { type: DataTypes.STRING(50), allowNull: false },
  departure_time: { type: DataTypes.TIME, allowNull: false },
  arrival_time: { type: DataTypes.TIME, allowNull: false },
  status: { type: DataTypes.ENUM('Active', 'Inactive', 'Cancelled'), defaultValue: 'Active' },
  valid_from: { type: DataTypes.DATEONLY, defaultValue: null },
  valid_until: { type: DataTypes.DATEONLY, defaultValue: null },
  driver_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  car_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  trip_date: { type: DataTypes.DATEONLY, defaultValue: null },
  booked_seats: { type: DataTypes.INTEGER, defaultValue: 0 },
  started_at: { type: DataTypes.DATE, defaultValue: null },
  completed_at: { type: DataTypes.DATE, defaultValue: null },
}, {
  tableName: 'bus_schedules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = BusSchedule;