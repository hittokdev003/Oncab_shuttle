'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BusSchedule = sequelize.define('BusSchedule', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  bus_type_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  schedule_code: { type: DataTypes.STRING(50), allowNull: false },
  bus_number: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.vehicle?.registration_number || null;
    },
  },
  departure_time: { type: DataTypes.TIME, allowNull: false },
  arrival_time: { type: DataTypes.TIME, allowNull: true },
  operating_days: { type: DataTypes.STRING(100), defaultValue: null },
  status: { type: DataTypes.STRING(50), defaultValue: 'Scheduled' },
  valid_from: { type: DataTypes.DATEONLY, defaultValue: null },
  valid_until: { type: DataTypes.DATEONLY, defaultValue: null },
  driver_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  vehicle_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  car_id: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.vehicle_id;
    },
  },
  trip_date: { type: DataTypes.DATEONLY, defaultValue: null },
  booked_seats: { type: DataTypes.INTEGER, defaultValue: 0 },
  started_at: { type: DataTypes.DATE, defaultValue: null },
  completed_at: { type: DataTypes.DATE, defaultValue: null },
  notes: { type: DataTypes.TEXT, defaultValue: null },
}, {
  tableName: 'trips',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = BusSchedule;