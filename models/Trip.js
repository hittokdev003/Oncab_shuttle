'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Trip = sequelize.define('Trip', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  bus_type_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  schedule_code: { type: DataTypes.STRING(30), allowNull: false },
  departure_time: { type: DataTypes.TIME, allowNull: false },
  arrival_time: { type: DataTypes.TIME, defaultValue: null },
  operating_days: { type: DataTypes.STRING(100), defaultValue: null },
  booked_seats: { type: DataTypes.INTEGER, defaultValue: 0 },
  trip_date: { type: DataTypes.DATEONLY, defaultValue: null },
  valid_from: { type: DataTypes.DATEONLY, defaultValue: null },
  valid_until: { type: DataTypes.DATEONLY, defaultValue: null },
  driver_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  vehicle_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  started_at: { type: DataTypes.DATE, defaultValue: null },
  completed_at: { type: DataTypes.DATE, defaultValue: null },
  status: { type: DataTypes.ENUM('Scheduled', 'Active', 'Completed', 'Cancelled', 'Delayed'), defaultValue: 'Scheduled' },
  notes: { type: DataTypes.TEXT, defaultValue: null },
  deleted_at: { type: DataTypes.DATE, defaultValue: null },
}, {
  tableName: 'trips',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at',
  indexes: [
    {
      unique: true,
      fields: ['schedule_code', 'trip_date'],
      name: 'unique_schedule_code_trip_date',
    },
  ],
});

module.exports = Trip;
