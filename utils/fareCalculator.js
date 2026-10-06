'use strict';

const { RateChart, Stop } = require('../models');

const resolveFare = async ({ routeId, originStopId, destinationStopId, fallbackFare, transaction }) => {
  const originId = originStopId ? Number(originStopId) : null;
  const destinationId = destinationStopId ? Number(destinationStopId) : null;

  // 1. Check specific stop pair rate in rate_charts table
  if (routeId && originId && destinationId) {
    const stopFare = await RateChart.findOne({
      where: {
        route_id: routeId,
        origin_stop_id: originId,
        destination_stop_id: destinationId,
      },
      transaction,
    });
    if (stopFare && Number(stopFare.fare_amount) > 0) {
      return { fare: Number(stopFare.fare_amount), source: 'stop_pair' };
    }
  }

  // 2. Check route-level default rate in rate_charts table (where origin/destination are NULL)
  if (routeId) {
    const routeFare = await RateChart.findOne({
      where: { route_id: routeId, origin_stop_id: null, destination_stop_id: null },
      transaction,
    });
    if (routeFare && Number(routeFare.fare_amount) > 0) {
      return { fare: Number(routeFare.fare_amount), source: 'route' };
    }

    // 3. Fallback check for any fare entry for route_id
    const anyRouteFare = await RateChart.findOne({
      where: { route_id: routeId },
      transaction,
    });
    if (anyRouteFare && Number(anyRouteFare.fare_amount) > 0) {
      return { fare: Number(anyRouteFare.fare_amount), source: 'route' };
    }
  }

  return { fare: Number(fallbackFare) || 0, source: 'schedule' };
};

module.exports = { resolveFare };
