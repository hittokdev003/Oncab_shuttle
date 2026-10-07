'use strict';

const { hasRole } = require('../utils/roles');

const { Op } = require('sequelize');
const { Vehicle, DriverDetail, Trip, Route, Stop, Driver } = require('../models');

const distanceInMeters = (latitude1, longitude1, latitude2, longitude2) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitude2 - latitude1);
  const longitudeDelta = radians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const findNearestStop = (latitude, longitude, stops) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !stops.length) return null;
  return stops.reduce((nearest, stop, index) => {
    const distance = distanceInMeters(latitude, longitude, Number(stop.latitude), Number(stop.longitude));
    return !nearest || distance < nearest.distance_meters
      ? { stop_id: stop.id, stop_name: stop.stop_name, stop_sequence: stop.stop_sequence, distance_meters: Math.round(distance), route_index: index }
      : nearest;
  }, null);
};

exports.dashboard = async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const isOwner = hasRole(req.user, 'owner');
    const ownerVehicleWhere = isOwner ? { owner_id: req.user.id } : {};
    const ownerDriverWhere = isOwner ? { owner_id: req.user.id } : {};
    const [vehicles, trips, routes] = await Promise.all([
      Vehicle.findAll({
        where: ownerVehicleWhere,
        attributes: ['id', 'registration_number', 'company_model', 'status', 'latitude', 'longitude', 'driver_id', 'bus_type_id', 'owner_id'],
        include: [{
          model: Driver,
          as: 'driver',
          attributes: ['id', 'name', 'mobile', 'online_status', 'owner_id'],
          include: [{ model: DriverDetail, as: 'details', attributes: ['latitude', 'longitude', 'location_speed_kmh', 'location_heading', 'location_trip_id', 'updated_at'] }],
        }],
        order: [['registration_number', 'ASC']],
      }),
      Trip.findAll({
        where: {
          status: { [Op.in]: ['Scheduled', 'Active', 'Delayed'] },
          [Op.or]: [{ trip_date: null }, { trip_date: { [Op.gte]: today } }],
        },
        include: [
          { model: Route, as: 'route', include: [{ model: Stop, as: 'stops', attributes: ['id', 'stop_name', 'latitude', 'longitude', 'stop_sequence'], required: false }] },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'mobile'],
            required: false,
            include: [{ model: DriverDetail, as: 'details', attributes: ['latitude', 'longitude', 'location_speed_kmh', 'location_heading', 'location_trip_id', 'updated_at'] }],
          },
          { model: Vehicle, as: 'vehicle', attributes: ['id', 'registration_number'], required: false },
        ],
        order: [['trip_date', 'ASC'], ['departure_time', 'ASC']],
      }),
      Route.findAll({
        attributes: ['id', 'route_name', 'route_code', 'origin_city', 'destination_city', 'status'],
        include: [{ model: Stop, as: 'stops', attributes: ['id', 'stop_name', 'latitude', 'longitude', 'stop_sequence'], required: false }],
        order: [['route_name', 'ASC']],
      }),
    ]);

    const ownedVehicleIds = vehicles.map((vehicle) => Number(vehicle.id));
    const ownedDriverIds = vehicles.map((vehicle) => Number(vehicle.driver_id)).filter(Boolean);
    const filteredTrips = isOwner
      ? trips.filter((trip) => {
          const tripVehicleId = Number(trip.vehicle_id);
          const tripDriverId = Number(trip.driver_id);
          return (tripVehicleId && ownedVehicleIds.includes(tripVehicleId)) || (tripDriverId && ownedDriverIds.includes(tripDriverId));
        })
      : trips;

    const serializedTrips = filteredTrips.map((trip) => {
      const data = trip.toJSON();
      data.route?.stops?.sort((a, b) => a.stop_sequence - b.stop_sequence);
      return data;
    });

    const busData = vehicles.map((vehicleModel) => {
      const vehicle = vehicleModel.toJSON();
      const vehicleDetail = vehicle.driver?.details;
      const associatedTrips = serializedTrips.filter((trip) => Number(trip.vehicle_id) === Number(vehicle.id)
        || (vehicle.driver?.id && Number(trip.driver_id) === Number(vehicle.driver.id))
        || (vehicleDetail?.location_trip_id && Number(trip.id) === Number(vehicleDetail.location_trip_id)));
      const currentTrip = associatedTrips.find((trip) => ['Active', 'Delayed'].includes(trip.status)) || null;
      const upcomingTrip = associatedTrips.find((trip) => trip.status === 'Scheduled') || null;
      const detail = currentTrip?.driver?.details || vehicleDetail;
      const rawLatitude = detail?.latitude != null ? detail.latitude : vehicle.latitude;
      const rawLongitude = detail?.longitude != null ? detail.longitude : vehicle.longitude;
      const hasCoordinates = rawLatitude != null && rawLongitude != null && rawLatitude !== '' && rawLongitude !== '';
      const latitude = hasCoordinates ? Number(rawLatitude) : NaN;
      const longitude = hasCoordinates ? Number(rawLongitude) : NaN;
      const updatedAt = detail?.updated_at || null;
      const gpsAgeSeconds = updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)) : null;
      const positionIsValid = Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
      const gpsFresh = positionIsValid && gpsAgeSeconds !== null && gpsAgeSeconds <= 120;
      const routeStops = (currentTrip?.route?.stops || upcomingTrip?.route?.stops || [])
        .filter((stop) => stop.latitude != null && stop.longitude != null
          && Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude))
          && Math.abs(Number(stop.latitude)) <= 90 && Math.abs(Number(stop.longitude)) <= 180);
      const nearestStop = currentTrip && positionIsValid ? findNearestStop(latitude, longitude, routeStops) : null;
      const trackingStatus = vehicle.status !== 'Active'
        ? 'Inactive'
        : currentTrip
          ? gpsFresh ? 'Live' : positionIsValid ? 'Stale' : 'No GPS'
          : upcomingTrip ? 'Upcoming' : gpsFresh ? 'Available' : 'Offline';

      return {
        id: vehicle.id,
        registration_number: vehicle.registration_number,
        model: vehicle.company_model,
        vehicle_status: vehicle.status,
        tracking_status: trackingStatus,
        driver: (currentTrip?.driver || vehicle.driver) ? {
          id: (currentTrip?.driver || vehicle.driver).id,
          name: (currentTrip?.driver || vehicle.driver).name,
          mobile: (currentTrip?.driver || vehicle.driver).mobile,
          online_status: (currentTrip?.driver || vehicle.driver).online_status || null,
        } : null,
        location: positionIsValid ? {
          latitude,
          longitude,
          speed_kmh: detail?.location_speed_kmh == null ? null : Number(detail.location_speed_kmh),
          heading: detail?.location_heading == null ? null : Number(detail.location_heading),
          updated_at: updatedAt,
          age_seconds: gpsAgeSeconds,
          is_live: gpsFresh,
        } : null,
        current_trip: currentTrip,
        upcoming_trip: upcomingTrip,
        nearest_stop: nearestStop,
        stops_passed_estimate: nearestStop ? nearestStop.route_index : 0,
      };
    });

    const routesWithStatus = routes.map((routeModel) => {
      const route = routeModel.toJSON();
      route.stops?.sort((a, b) => a.stop_sequence - b.stop_sequence);
      const routeTrips = serializedTrips.filter((trip) => Number(trip.route_id) === Number(route.id));
      const activeCount = busData.filter((bus) => Number(bus.current_trip?.route_id) === Number(route.id)).length;
      return {
        ...route,
        active_buses: activeCount,
        upcoming_trips: routeTrips.filter((trip) => trip.status === 'Scheduled').length,
        trip_status: activeCount ? 'In progress' : routeTrips.some((trip) => trip.status === 'Scheduled') ? 'Upcoming' : 'No active trips',
      };
    });

    res.json({
      success: true,
      data: {
        generated_at: new Date().toISOString(),
        buses: busData,
        routes: routesWithStatus,
        summary: {
          total: busData.length,
          live: busData.filter((bus) => bus.tracking_status === 'Live').length,
          upcoming: busData.filter((bus) => bus.tracking_status === 'Upcoming').length,
          offline: busData.filter((bus) => ['Offline', 'Stale', 'No GPS'].includes(bus.tracking_status)).length,
          inactive: busData.filter((bus) => bus.tracking_status === 'Inactive').length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};