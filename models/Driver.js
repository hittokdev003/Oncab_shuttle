'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Driver = sequelize.define('Driver', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  city_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  zone_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  driver_type_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  vehicle_type_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  is_bus_driver: { type: DataTypes.BOOLEAN, defaultValue: false },
  preferred_bus_type_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  driver_user_id: { type: DataTypes.STRING(50), defaultValue: null },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(150), defaultValue: null },
  mobile: { type: DataTypes.STRING(20), defaultValue: null },
  aadhar: { type: DataTypes.STRING(20), defaultValue: null },
  pan: { type: DataTypes.STRING(15), defaultValue: null },
  address: { type: DataTypes.TEXT, defaultValue: null },
  sex: { type: DataTypes.ENUM('Male', 'Female', 'Other'), defaultValue: null },
  device_id: { type: DataTypes.STRING(100), defaultValue: null },
  photo: { type: DataTypes.STRING(255), defaultValue: null },
  referral: { type: DataTypes.STRING(50), defaultValue: null },
  created_by: { type: DataTypes.STRING(100), defaultValue: null },
  block_status: { type: DataTypes.ENUM('Block', 'Unblock'), defaultValue: 'Unblock' },
  complete_status: { type: DataTypes.ENUM('Complete', 'Incomplete'), defaultValue: 'Incomplete' },
  online_status: { type: DataTypes.ENUM('Online', 'Offline'), defaultValue: 'Offline' },
  status: { type: DataTypes.ENUM('Approve', 'Disapprove', 'Reject', 'Pending'), defaultValue: 'Pending' },
  deleted_at: { type: DataTypes.DATE, defaultValue: null },
}, {
  tableName: 'drivers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = Driver;
