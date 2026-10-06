'use strict';

const sequelize = require('../config/database');
const RouteStop = require('../models/RouteStop');

async function syncRouteStopsTable() {
  try {
    // 1. Sync Table Schema
    await RouteStop.sync();

    // 2. Populate route_stops from legacy stops table if missing
    await sequelize.query(`
      INSERT IGNORE INTO route_stops (route_id, stop_id, stop_sequence, pickup_allowed, dropoff_allowed, status, created_at, updated_at)
      SELECT route_id, id, IFNULL(stop_sequence, 1), 1, 1, 'Active', NOW(), NOW()
      FROM stops
      WHERE route_id IS NOT NULL AND route_id > 0;
    `);
  } catch (err) {
    // Log error silently if table already exists or column sync is skipped
    console.error('[RouteStopMigrator] Sync note:', err.message);
  }
}

// Auto-run sync on initialization
syncRouteStopsTable();

module.exports = { syncRouteStopsTable };
