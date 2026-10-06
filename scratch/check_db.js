'use strict';
const { Route, Stop, RouteStop, BusSchedule, Trip } = require('../models');

(async () => {
  try {
    const routes = await Route.findAll({
      include: [
        { model: Stop, as: 'stops' },
        { model: RouteStop, as: 'route_stops', include: [{ model: Stop, as: 'stop' }] }
      ]
    });
    console.log('Routes found:', routes.length);
    for (const r of routes) {
      console.log(`Route ID: ${r.id}, Name: ${r.route_name}, Status: ${r.status}`);
      const stops = r.route_stops && r.route_stops.length 
        ? r.route_stops.map(rs => `${rs.stop_sequence}: ${rs.stop?.stop_name} (ID: ${rs.stop_id})`).join(', ') 
        : (r.stops || []).map(s => `${s.stop_sequence}: ${s.stop_name} (ID: ${s.id})`).join(', ');
      console.log('  Stops:', stops);
      
      const schedules = await BusSchedule.findAll({ where: { route_id: r.id } });
      console.log('  BusSchedules:', schedules.map(s => ({ id: s.id, status: s.status, departure: s.departure_time, days: s.operating_days })));
      
      const trips = await Trip.findAll({ where: { route_id: r.id } });
      console.log('  Trips:', trips.map(t => ({ id: t.id, status: t.status, date: t.trip_date })));
    }
  } catch (err) {
    console.error(err);
  }
  process.exit();
})();
