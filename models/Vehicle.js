'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Vehicle = sequelize.define('Vehicle', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  driver_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  vehicle_type_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  bus_type_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  registration_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  company_model: { type: DataTypes.STRING(100), defaultValue: null },
  engine_type: { type: DataTypes.STRING(50), defaultValue: null },
  color: { type: DataTypes.STRING(50), defaultValue: null },
  total_seats: { type: DataTypes.INTEGER, defaultValue: 0 },
  engine_number: { type: DataTypes.STRING(50), defaultValue: null },
  chassis_number: { type: DataTypes.STRING(50), defaultValue: null },
  garage_address: { type: DataTypes.TEXT, defaultValue: null },
  latitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
  longitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
  purchase_date: { type: DataTypes.DATEONLY, defaultValue: null },
  rc_certificate_img: { type: DataTypes.STRING(255), defaultValue: null },
  vehicle_img: { type: DataTypes.STRING(255), defaultValue: null },
  status: { type: DataTypes.ENUM('Active', 'Inactive', 'Under Maintenance'), defaultValue: 'Active' },
  deleted_at: { type: DataTypes.DATE, defaultValue: null },
}, {
  tableName: 'vehicles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at',
});

module.exports = Vehicle;
