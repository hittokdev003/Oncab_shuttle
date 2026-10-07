'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OwnerApprovalRequest = sequelize.define('OwnerApprovalRequest', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  request_type: { type: DataTypes.ENUM('driver_create', 'driver_update', 'vehicle_create', 'vehicle_update', 'trip_assignment'), allowNull: false },
  target_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  payload: { type: DataTypes.TEXT('long'), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
  reviewed_by: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  reviewed_at: { type: DataTypes.DATE, defaultValue: null },
  admin_note: { type: DataTypes.TEXT, defaultValue: null },
}, {
  tableName: 'owner_approval_requests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = OwnerApprovalRequest;
