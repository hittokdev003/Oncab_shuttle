'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShuttleRoute = sequelize.define('ShuttleRoute', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  route_name: { type: DataTypes.STRING(255), allowNull: false },
  display_name: { type: DataTypes.STRING(255), defaultValue: null },
  origin_name: { type: DataTypes.STRING(255), allowNull: false },
  destination_name: { type: DataTypes.STRING(255), allowNull: false },
  direction: { type: DataTypes.ENUM('outbound', 'return'), defaultValue: 'outbound' },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
}, {
  tableName: 'shuttle_routes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ShuttleRoute;
