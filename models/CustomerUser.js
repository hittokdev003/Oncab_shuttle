'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CustomerUser = sequelize.define('CustomerUser', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  city_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  zone_id: { type: DataTypes.BIGINT.UNSIGNED, defaultValue: null },
  name: { type: DataTypes.STRING(255), defaultValue: null },
  email: { type: DataTypes.STRING(50), defaultValue: null },
  mobile: { type: DataTypes.STRING(255), defaultValue: null },
  aadhar: { type: DataTypes.STRING(255), defaultValue: null },
  pan: { type: DataTypes.STRING(255), defaultValue: null },
  password: { type: DataTypes.STRING(255), defaultValue: null },
  address: { type: DataTypes.TEXT, defaultValue: null },
  referral: { type: DataTypes.STRING(255), defaultValue: null },
  referral_qrcode: { type: DataTypes.TEXT, defaultValue: null },
  referral_by: { type: DataTypes.STRING(255), defaultValue: null },
  sex: { type: DataTypes.ENUM('Male', 'Female'), defaultValue: null },
  device_id: { type: DataTypes.TEXT, defaultValue: null },
  photo: { type: DataTypes.TEXT, defaultValue: null },
  avatar: { type: DataTypes.STRING(255), defaultValue: null },
  gallery_images: { type: DataTypes.JSON, defaultValue: null },
  block_status: { type: DataTypes.ENUM('Block', 'Unblock'), defaultValue: 'Unblock' },
  online_status: { type: DataTypes.ENUM('Online', 'Offline'), defaultValue: 'Offline' },
  status: { type: DataTypes.STRING(50), defaultValue: null },
  mail_created_at: { type: DataTypes.DATE, defaultValue: null },
  first_time_login: { type: DataTypes.STRING(255), defaultValue: null },
  remember_token: { type: DataTypes.STRING(100), defaultValue: null },
  complete_status: { type: DataTypes.STRING(50), defaultValue: null },
  wallet_balance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = CustomerUser;