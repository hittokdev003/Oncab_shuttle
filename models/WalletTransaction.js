'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WalletTransaction = sequelize.define('WalletTransaction', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  passenger_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  type: { type: DataTypes.ENUM('credit', 'debit'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  balance_after: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  source: { type: DataTypes.STRING(30), allowNull: false },
  reference_type: { type: DataTypes.STRING(30), allowNull: false },
  reference_id: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(255), defaultValue: null },
}, {
  tableName: 'wallet_transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['reference_type', 'reference_id', 'type'] },
    { fields: ['passenger_id', 'created_at'] },
  ],
});

module.exports = WalletTransaction;
