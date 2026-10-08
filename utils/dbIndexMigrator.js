'use strict';

const sequelize = require('../config/database');

const ensureTripsIndex = async () => {
  try {
    const [indexes] = await sequelize.query('SHOW INDEX FROM trips');
    const singleScheduleCodeIndexes = new Set();
    const mapKeyToCols = {};

    for (const idx of indexes) {
      if (!mapKeyToCols[idx.Key_name]) {
        mapKeyToCols[idx.Key_name] = [];
      }
      mapKeyToCols[idx.Key_name].push({ col: idx.Column_name, non_unique: idx.Non_unique });
    }

    for (const [keyName, cols] of Object.entries(mapKeyToCols)) {
      if (keyName === 'PRIMARY') continue;
      const isUnique = cols[0].non_unique === 0;
      if (isUnique && cols.length === 1 && cols[0].col === 'schedule_code') {
        singleScheduleCodeIndexes.add(keyName);
      }
    }

    for (const indexName of singleScheduleCodeIndexes) {
      console.log(`Dropping single-column unique index on schedule_code: ${indexName}`);
      await sequelize.query(`ALTER TABLE trips DROP INDEX \`${indexName}\``);
    }

    let hasCompositeUnique = false;
    for (const [keyName, cols] of Object.entries(mapKeyToCols)) {
      const isUnique = cols[0].non_unique === 0;
      if (isUnique && cols.length === 2) {
        const colNames = cols.map((c) => c.col);
        if (colNames.includes('schedule_code') && colNames.includes('trip_date')) {
          hasCompositeUnique = true;
        }
      }
    }

    if (!hasCompositeUnique) {
      console.log('Adding composite unique index on trips (schedule_code, trip_date)');
      await sequelize.query('ALTER TABLE trips ADD UNIQUE INDEX `unique_schedule_code_trip_date` (`schedule_code`, `trip_date`)');
    }
  } catch (err) {
    console.error('ensureTripsIndex error:', err.message);
  }
};

module.exports = { ensureTripsIndex };
