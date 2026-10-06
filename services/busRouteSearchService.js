'use strict';

const { Op } = require('sequelize');
const { Route, Stop, BusRoute, BusStop, BusSchedule, Trip, BusType, RateChart, Booking } = require('../models');
const { resolveFare } = require('../utils/fareCalculator');
const {
  calcHaversineDistanceKm,
  formatDistance,
  resolveLocation,
  normalizeText,
} = require('./busStopSearchService');

/**
 * Convert HH:MM / HH:MM:SS string to minutes from midnight
 */
const getMinutesFromMidnight = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
};

/**
 * Format 24h time string to 12h AM/PM
 */
const format12HourTime = (timeStr, offsetMins = 0) => {
  if (!timeStr) return '';
  let baseMins = getMinutesFromMidnight(timeStr);
  let totalMins = (baseMins + offsetMins) % (24 * 60);
  if (totalMins < 0) totalMins += 24 * 60;

  const h24 = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mmStr = String(m).padStart(2, '0');
  return `${h12}:${mmStr} ${ampm}`;
};

/**
 * Format Date String YYYY-MM-DD
 */
const formatDateStr = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
};

/**
 * Check if schedule can operate on a given date
 */
const scheduleCanRunOnDate = (sch, searchDateStr) => {
  if (!sch) return false;
  const validFrom = formatDateStr(sch.valid_from);
  const validUntil = formatDateStr(sch.valid_until);
  const tripDate = formatDateStr(sch.trip_date);

  if (validFrom && validFrom > searchDateStr) return false;
  if (validUntil && validUntil < searchDateStr) return false;
  if (tripDate) return tripDate === searchDateStr;

  if (!sch.operating_days) return true;

  const searchDateObj = new Date(`${searchDateStr}T00:00:00.000Z`);
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekday = weekdays[isNaN(searchDateObj.getUTCDay()) ? 0 : searchDateObj.getUTCDay()];

  const operatingDays = String(sch.operating_days).toLowerCase().split(/[,:]/).map((d) => d.trim());
  return operatingDays.includes(weekday);
};

/**
 * Main Cityflo-Style Route Search Service
 */
class BusRouteSearchService {
  /**
   * Search routes matching pickup & dropoff candidates
   */
  static async search(params) {
    const {
      pickupInput,
      dropoffInput,
      travelDateInput,
      passengersInput,
      busTypeId,
    } = params;

    const todayStr = new Date().toISOString().split('T')[0];
    const travelDate = travelDateInput || todayStr;
    const reqPassengers = parseInt(passengersInput || 1, 10);

    // 1. Resolve Pickup & Dropoff Stop Candidates
    const pickupCandidates = await resolveLocation(pickupInput, 'pickup');
    const dropoffCandidates = await resolveLocation(dropoffInput, 'dropoff');

    const topResolvedPickup = pickupCandidates.length > 0 ? pickupCandidates[0] : null;
    const topResolvedDropoff = dropoffCandidates.length > 0 ? dropoffCandidates[0] : null;

    if (!topResolvedPickup || !topResolvedDropoff) {
      return this.formatNoRoutesResponse({
        pickupInput,
        dropoffInput,
        travelDate,
        reqPassengers,
        topResolvedPickup,
        topResolvedDropoff,
        message: 'Could not resolve pickup or dropoff location',
      });
    }

    // 2. Fetch All Active Routes & Route Stops from Database
    let routes = await Route.findAll({
      where: { status: 'Active', deleted_at: null },
      include: [
        { model: Stop, as: 'stops', required: false, where: { status: 'Active' } },
      ],
    });

    if (!routes || routes.length === 0) {
      routes = await BusRoute.findAll({
        where: { status: 'Active' },
        include: [
          { model: BusStop, as: 'stops', required: false, where: { status: 'Active' } },
        ],
      });
    }

    // Extract user input coordinates if available
    const userPLat = topResolvedPickup.latitude;
    const userPLng = topResolvedPickup.longitude;
    const userDLat = topResolvedDropoff.latitude;
    const userDLng = topResolvedDropoff.longitude;

    // 3. Search Direct Candidate Routes
    const directCandidates = await this.findMatchingRoutes({
      routes,
      pickupCandidates: [topResolvedPickup, ...pickupCandidates.slice(1, 4)],
      dropoffCandidates: [topResolvedDropoff, ...dropoffCandidates.slice(1, 4)],
      travelDate,
      reqPassengers,
      busTypeId,
      userPLat,
      userPLng,
      userDLat,
      userDLng,
    });

    // 4. Fallback Alternative Search (If no direct route, search expanded nearby stops)
    let nearbyCandidates = [];
    if (directCandidates.length === 0) {
      nearbyCandidates = await this.findMatchingRoutes({
        routes,
        pickupCandidates,
        dropoffCandidates,
        travelDate,
        reqPassengers,
        busTypeId,
        userPLat,
        userPLng,
        userDLat,
        userDLng,
        isNearbySearch: true,
      });
    }

    const finalCandidates = directCandidates.length > 0 ? directCandidates : nearbyCandidates;

    return this.buildFormattedSearchResponse({
      pickupInput,
      dropoffInput,
      travelDate,
      reqPassengers,
      topResolvedPickup,
      topResolvedDropoff,
      directCandidates,
      nearbyCandidates,
      finalCandidates,
    });
  }

  /**
   * Find routes matching candidate stops and validating stop order direction (pickup_seq < dropoff_seq)
   */
  static async findMatchingRoutes(opts) {
    const {
      routes,
      pickupCandidates,
      dropoffCandidates,
      travelDate,
      reqPassengers,
      busTypeId,
      userPLat,
      userPLng,
      userDLat,
      userDLng,
    } = opts;

    const matchedResults = [];
    const pickupIds = new Set(pickupCandidates.map((c) => c.id || c.stop_id));
    const dropoffIds = new Set(dropoffCandidates.map((c) => c.id || c.stop_id));

    for (const route of routes) {
      const stops = (route.stops || []).sort((a, b) => Number(a.stop_sequence || 0) - Number(b.stop_sequence || 0));
      if (stops.length < 2) continue;

      // Find all matching pickup stops on this route
      const matchingPickupStops = stops.filter((s) => {
        const id = Number(s.id);
        const nameNorm = normalizeText(s.stop_name || s.name);
        return pickupIds.has(id) || pickupCandidates.some((c) => normalizeText(c.name) === nameNorm);
      });

      if (matchingPickupStops.length === 0) continue;

      // Find all matching dropoff stops on this route
      const matchingDropoffStops = stops.filter((s) => {
        const id = Number(s.id);
        const nameNorm = normalizeText(s.stop_name || s.name);
        return dropoffIds.has(id) || dropoffCandidates.some((c) => normalizeText(c.name) === nameNorm);
      });

      if (matchingDropoffStops.length === 0) continue;

      // DIRECTION VALIDATION: Check for pairs where pickup_stop_order < dropoff_stop_order
      let validPair = null;
      for (const pStop of matchingPickupStops) {
        const pSeq = Number(pStop.stop_sequence || 1);
        for (const dStop of matchingDropoffStops) {
          const dSeq = Number(dStop.stop_sequence || 2);

          if (pSeq < dSeq && pStop.id !== dStop.id) {
            validPair = { pickupStop: pStop, dropStop: dStop };
            break;
          }
        }
        if (validPair) break;
      }

      if (!validPair) continue; // Invalid direction (pickup is after dropoff)

      const { pickupStop, dropStop } = validPair;

      // Retrieve trips/schedules for this route & stop pair
      const scheduleRes = await this.getSchedulesForRouteStopPair({
        route,
        pickupStop,
        dropStop,
        travelDate,
        reqPassengers,
        busTypeId,
      });

      if (!scheduleRes.success || scheduleRes.schedules.length === 0) continue;

      const pDistKm = userPLat != null && userPLng != null ? calcHaversineDistanceKm(userPLat, userPLng, pickupStop.latitude, pickupStop.longitude) : 0;
      const dDistKm = userDLat != null && userDLng != null ? calcHaversineDistanceKm(userDLat, userDLng, dropStop.latitude, dropStop.longitude) : 0;

      matchedResults.push({
        route,
        pickupStop,
        dropStop,
        pickupDistKm: pDistKm,
        dropDistKm: dDistKm,
        schedules: scheduleRes.schedules,
        durationMinutes: scheduleRes.durationMinutes,
        fareAmount: scheduleRes.fareAmount,
        pickupSeq: Number(pickupStop.stop_sequence || 1),
        dropSeq: Number(dropStop.stop_sequence || 2),
      });
    }

    // Deterministic ranking: direct route weight + pickup/dropoff distance + departure time + duration
    matchedResults.sort((a, b) => {
      if (Math.abs(a.pickupDistKm - b.pickupDistKm) > 0.1) return a.pickupDistKm - b.pickupDistKm;
      if (Math.abs(a.dropDistKm - b.dropDistKm) > 0.1) return a.dropDistKm - b.dropDistKm;
      const aMinPickup = Math.min(...a.schedules.map((s) => s.pickupMins || 0));
      const bMinPickup = Math.min(...b.schedules.map((s) => s.pickupMins || 0));
      if (aMinPickup !== bMinPickup) return aMinPickup - bMinPickup;
      return a.durationMinutes - b.durationMinutes;
    });

    return matchedResults;
  }

  /**
   * Fetch active schedules and calculate fares for a specific route & stop pair
   */
  static async getSchedulesForRouteStopPair(opts) {
    const { route, pickupStop, dropStop, travelDate, reqPassengers, busTypeId } = opts;

    const whereSchedule = {
      route_id: route.id,
      status: { [Op.in]: ['Active', 'Scheduled'] },
    };
    if (busTypeId) whereSchedule.bus_type_id = busTypeId;

    let rawSchedules = await BusSchedule.findAll({
      where: whereSchedule,
      include: [{ model: BusType, as: 'bus_type', required: false }],
      order: [['departure_time', 'ASC']],
    });

    if (!rawSchedules || rawSchedules.length === 0) {
      rawSchedules = await Trip.findAll({
        where: whereSchedule,
        include: [{ model: BusType, as: 'bus_type', required: false }],
        order: [['departure_time', 'ASC']],
      });
    }

    if (!rawSchedules || rawSchedules.length === 0) {
      return { success: false, reason: 'NO_ACTIVE_SCHEDULES', schedules: [] };
    }

    const matchingSchedules = rawSchedules.filter((sch) => scheduleCanRunOnDate(sch, travelDate));
    if (matchingSchedules.length === 0) {
      return { success: false, reason: 'NO_SCHEDULES_FOR_DATE', schedules: [] };
    }

    // Stop duration calculation
    const stops = (route.stops || []).sort((a, b) => Number(a.stop_sequence || 0) - Number(b.stop_sequence || 0));
    const pSeq = Number(pickupStop.stop_sequence || 1);
    const dSeq = Number(dropStop.stop_sequence || 2);
    const totalStops = stops.length || 2;
    const interStopMins = totalStops > 1 ? Math.round((Number(route.estimated_duration || 60)) / (totalStops - 1)) : 10;

    const pickupOffsetMins = (pSeq - 1) * interStopMins;
    const dropOffsetMins = (dSeq - 1) * interStopMins;
    const tripDurationMins = Math.max(5, dropOffsetMins - pickupOffsetMins);

    // Resolve Fare using RateChart or fallback
    const fareRes = await resolveFare({
      routeId: route.id,
      originStopId: pickupStop.id,
      destinationStopId: dropStop.id,
      fallbackFare: 50.00,
    });
    const fareAmount = fareRes.fare || 50.00;

    const validSchedules = [];

    for (const sch of matchingSchedules) {
      const schId = Number(sch.id);
      const busCap = sch.bus_type?.total_seats || sch.seat_capacity || 40;

      // Calculate booked seats
      const bookedCount = await Booking.count({
        where: {
          trip_id: schId,
          booking_status: { [Op.ne]: 'cancelled' },
        },
      });

      const availSeats = Math.max(0, busCap - bookedCount);
      if (availSeats < reqPassengers) continue;

      const baseDepTime = sch.departure_time || '08:00:00';
      const pickupTimeDisplay = format12HourTime(baseDepTime, pickupOffsetMins);
      const dropTimeDisplay = format12HourTime(baseDepTime, dropOffsetMins);
      const pickupMins = (getMinutesFromMidnight(baseDepTime) + pickupOffsetMins) % (24 * 60);

      validSchedules.push({
        schedule_id: schId,
        trip_id: schId,
        trip_date: sch.trip_date || travelDate,
        route_id: Number(route.id),
        bus_type_id: sch.bus_type_id || sch.bus_type?.id || null,
        bus_type: sch.bus_type || null,
        departure_time: sch.departure_time,
        pickup_time: pickupTimeDisplay,
        drop_time: dropTimeDisplay,
        pickupMins,
        available_seats: availSeats,
        seat_capacity: busCap,
        status: sch.status || 'Active',
        fare: {
          amount: fareAmount,
          currency: 'INR',
          display: `₹${fareAmount.toFixed(0)}`,
        },
        pickup_stop: { id: pickupStop.id, name: pickupStop.stop_name || pickupStop.name },
        drop_stop: { id: dropStop.id, name: dropStop.stop_name || dropStop.name },
      });
    }

    if (validSchedules.length === 0) {
      return { success: false, reason: 'SEATS_FULL', schedules: [] };
    }

    return {
      success: true,
      schedules: validSchedules,
      durationMinutes: tripDurationMins,
      fareAmount,
    };
  }

  /**
   * Format empty search response
   */
  static formatNoRoutesResponse(opts) {
    const { pickupInput, dropoffInput, travelDate, reqPassengers, topResolvedPickup, topResolvedDropoff, message } = opts;
    return {
      success: true,
      message: message || 'No direct routes found',
      search: {
        pickup: typeof pickupInput === 'string' ? pickupInput : pickupInput?.name || 'Pickup',
        dropoff: typeof dropoffInput === 'string' ? dropoffInput : dropoffInput?.name || 'Dropoff',
        date: travelDate,
        passengers: reqPassengers,
      },
      resolved_pickup: topResolvedPickup ? {
        stop_id: topResolvedPickup.id,
        name: topResolvedPickup.name,
        matched_by: topResolvedPickup.matched_by,
        distance: topResolvedPickup.distance,
      } : null,
      resolved_dropoff: topResolvedDropoff ? {
        stop_id: topResolvedDropoff.id,
        name: topResolvedDropoff.name,
        matched_by: topResolvedDropoff.matched_by,
        distance: topResolvedDropoff.distance,
      } : null,
      routes: [],
      direct_routes: [],
      nearby_routes: [],
      top_pick: null,
      pickup_groups: [],
      all_timings: [],
      available_dates: [],
      summary: { total_routes: 0, total_timings: 0, direct_routes_count: 0 },
    };
  }

  /**
   * Format full Cityflo-style search response with backward-compatible legacy structures
   */
  static buildFormattedSearchResponse(opts) {
    const {
      pickupInput,
      dropoffInput,
      travelDate,
      reqPassengers,
      topResolvedPickup,
      topResolvedDropoff,
      directCandidates,
      nearbyCandidates,
      finalCandidates,
    } = opts;

    const pickupStr = typeof pickupInput === 'string' ? pickupInput : pickupInput?.name || topResolvedPickup.name;
    const dropoffStr = typeof dropoffInput === 'string' ? dropoffInput : dropoffInput?.name || topResolvedDropoff.name;

    // Cityflo Route Response Objects
    const routesFormatted = finalCandidates.map((cand) => {
      const routeObj = cand.route;
      return {
        route_id: Number(routeObj.id),
        route_name: routeObj.route_name || `${cand.pickupStop.name} → ${cand.dropStop.name}`,
        route_code: routeObj.route_code || `R-${routeObj.id}`,
        pickup_stop: {
          id: Number(cand.pickupStop.id),
          name: cand.pickupStop.stop_name || cand.pickupStop.name,
          stop_order: Number(cand.pickupStop.stop_sequence || 1),
          latitude: parseFloat(cand.pickupStop.latitude),
          longitude: parseFloat(cand.pickupStop.longitude),
        },
        dropoff_stop: {
          id: Number(cand.dropStop.id),
          name: cand.dropStop.stop_name || cand.dropStop.name,
          stop_order: Number(cand.dropStop.stop_sequence || 2),
          latitude: parseFloat(cand.dropStop.latitude),
          longitude: parseFloat(cand.dropStop.longitude),
        },
        pickup_distance: cand.pickupDistKm ? Math.round(cand.pickupDistKm * 1000) : 0,
        dropoff_distance: cand.dropDistKm ? Math.round(cand.dropDistKm * 1000) : 0,
        duration_minutes: cand.durationMinutes,
        fare: {
          amount: cand.fareAmount,
          currency: 'INR',
          display: `₹${cand.fareAmount.toFixed(0)}`,
        },
        trips: cand.schedules.map((sch) => ({
          trip_id: sch.schedule_id,
          schedule_id: sch.schedule_id,
          departure_time: sch.departure_time,
          pickup_time: sch.pickup_time,
          drop_time: sch.drop_time,
          available_seats: sch.available_seats,
          bus_type: sch.bus_type?.name || 'AC Executive Shuttle',
        })),
      };
    });

    // Backward-Compatible Structures (top_pick, pickup_groups, all_timings)
    let topPickItem = null;
    const pickupGroupMap = new Map();
    const allValidTimings = [];

    finalCandidates.forEach((cand, idx) => {
      const pDistInfo = formatDistance(cand.pickupDistKm);
      const dDistInfo = formatDistance(cand.dropDistKm);

      cand.schedules.forEach((sch) => {
        const timingEntry = {
          schedule_id: sch.schedule_id,
          route_id: sch.route_id,
          pickup_time: sch.pickup_time,
          drop_time: sch.drop_time,
          drop_stop: sch.drop_stop.name,
          drop_stop_id: sch.drop_stop.id,
          fare: sch.fare.amount,
          fare_display: sch.fare.display,
          available_seats: sch.available_seats,
          status: sch.status,
        };

        allValidTimings.push(timingEntry);

        if (!topPickItem && idx === 0) {
          topPickItem = {
            route_id: sch.route_id,
            schedule_id: sch.schedule_id,
            pickup_stop: {
              id: cand.pickupStop.id,
              name: cand.pickupStop.stop_name || cand.pickupStop.name,
              address: cand.pickupStop.address || cand.pickupStop.landmark || '',
              latitude: parseFloat(cand.pickupStop.latitude || topResolvedPickup.latitude || 0),
              longitude: parseFloat(cand.pickupStop.longitude || topResolvedPickup.longitude || 0),
              ...pDistInfo,
            },
            pickup_time: sch.pickup_time,
            drop_stop: {
              id: cand.dropStop.id,
              name: cand.dropStop.stop_name || cand.dropStop.name,
              address: cand.dropStop.address || cand.dropStop.landmark || '',
              latitude: parseFloat(cand.dropStop.latitude || topResolvedDropoff.latitude || 0),
              longitude: parseFloat(cand.dropStop.longitude || topResolvedDropoff.longitude || 0),
              ...dDistInfo,
            },
            drop_time: sch.drop_time,
            duration_minutes: cand.durationMinutes,
            fare: sch.fare,
            available_seats: sch.available_seats,
          };
        }

        const pStopId = cand.pickupStop.id;
        if (!pickupGroupMap.has(pStopId)) {
          pickupGroupMap.set(pStopId, {
            pickup_stop: {
              id: cand.pickupStop.id,
              name: cand.pickupStop.stop_name || cand.pickupStop.name,
              ...pDistInfo,
            },
            timings_count: 0,
            timings: [],
          });
        }
        const group = pickupGroupMap.get(pStopId);
        group.timings.push(timingEntry);
        group.timings_count = group.timings.length;
      });
    });

    // Generate upcoming dates
    const availableDates = [];
    const searchDateObj = new Date(travelDate);
    const baseDate = isNaN(searchDateObj.getTime()) ? new Date() : searchDateObj;

    for (let i = 0; i < 4; i++) {
      const dObj = new Date(baseDate);
      dObj.setDate(baseDate.getDate() + i);

      const yyyy = dObj.getFullYear();
      const mm = String(dObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dObj.getDate()).padStart(2, '0');
      const formattedDateStr = `${yyyy}-${mm}-${dd}`;

      availableDates.push({
        date: formattedDateStr,
        day: dObj.toLocaleString('en-US', { weekday: 'short' }),
        month: dObj.toLocaleString('en-US', { month: 'short' }),
        day_number: String(dObj.getDate()),
        is_selected: formattedDateStr === travelDate,
        total_timings: allValidTimings.length,
      });
    }

    const isDirect = directCandidates.length > 0;
    const msg = isDirect
      ? 'Routes found successfully'
      : (nearbyCandidates.length > 0 ? 'No direct route found. Nearby routes available.' : 'No routes found');

    return {
      success: true,
      message: msg,
      search: {
        pickup: pickupStr,
        dropoff: dropoffStr,
        date: travelDate,
        passengers: reqPassengers,
      },
      resolved_pickup: topResolvedPickup ? {
        stop_id: topResolvedPickup.id,
        name: topResolvedPickup.name,
        matched_by: topResolvedPickup.matched_by,
        distance: topResolvedPickup.distance,
      } : null,
      resolved_dropoff: topResolvedDropoff ? {
        stop_id: topResolvedDropoff.id,
        name: topResolvedDropoff.name,
        matched_by: topResolvedDropoff.matched_by,
        distance: topResolvedDropoff.distance,
      } : null,
      routes: routesFormatted,
      direct_routes: isDirect ? routesFormatted : [],
      nearby_routes: !isDirect ? routesFormatted : [],
      top_pick: topPickItem,
      pickup_groups: Array.from(pickupGroupMap.values()),
      all_timings: allValidTimings,
      available_dates: availableDates,
      summary: {
        total_routes: routesFormatted.length,
        total_timings: allValidTimings.length,
        direct_routes_count: directCandidates.length,
        nearby_routes_count: nearbyCandidates.length,
      },
    };
  }
}

module.exports = BusRouteSearchService;
