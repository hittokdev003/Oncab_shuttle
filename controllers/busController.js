'use strict';

const { Op, fn, col } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { BusType, BusRoute, BusSchedule, BusStop, Trip, Booking, Vehicle, Stop, Route, BusDriverAssignment, CustomerUser, Coupon, RateChart, Driver, DriverDetail, Payment, WalletTransaction } = require('../models');
const sequelize = require('../config/database');
const { resolveFare } = require('../utils/fareCalculator');

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

// ── 1. Get Bus Types ─────────────────────────────────────────
exports.getBusTypes = async (req, res, next) => {
  try {
    const busTypes = await BusType.findAll({
      where: { status: 'Active' },
      order: [['name', 'ASC']],
    });

    res.json({
      status: 200,
      success: true,
      message: 'Bus types retrieved successfully',
      data: busTypes,
    });
  } catch (err) {
    next(err);
  }
};

// ── 2. Get Routes ──────────────────────────────────────────────
exports.getRoutes = async (req, res, next) => {
  try {
    const origin_city = req.query?.origin_city || req.body?.origin_city;
    const destination_city = req.query?.destination_city || req.body?.destination_city;

    const where = { status: 'Active' };
    if (origin_city) where.origin_city = origin_city;
    if (destination_city) where.destination_city = destination_city;

    let routes = await Route.findAll({
      where,
      include: [
        { model: Stop, as: 'stops', required: false },
      ],
      order: [['origin_city', 'ASC'], ['destination_city', 'ASC']],
    });

    if (!routes || routes.length === 0) {
      routes = await BusRoute.findAll({
        where,
        include: [
          { model: BusStop, as: 'stops', required: false },
        ],
        order: [['origin_city', 'ASC'], ['destination_city', 'ASC']],
      });
    }

    res.json({
      status: 200,
      success: true,
      message: 'Routes retrieved successfully',
      data: routes,
    });
  } catch (err) {
    next(err);
  }
};

// Configurable Search Radii (in KM)
const PICKUP_SEARCH_RADIUS_KM = parseFloat(process.env.PICKUP_SEARCH_RADIUS_KM || 5.0);
const DROPOFF_SEARCH_RADIUS_KM = parseFloat(process.env.DROPOFF_SEARCH_RADIUS_KM || 5.0);

// Coordinate Validator
const validateCoordinates = (lat, lng) => {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
};

// Haversine Distance in Kilometers
const calcHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null || isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return Infinity;
  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Format Distance & Labels (Separate walking vs driving fields per specification)
const formatDistanceAndLabel = (distKm) => {
  const distMeters = Math.round(distKm * 1000);
  const roundedKm = Number(distKm.toFixed(2));
  
  if (distKm <= 1.0) {
    const walkMins = Math.max(1, Math.ceil(distMeters / 80));
    const walkLabel = distMeters <= 100 ? 'less than a min walk' : `${walkMins} min walk`;
    return {
      distance_meters: distMeters,
      distance_km: roundedKm,
      walking_minutes: walkMins,
      walking_label: walkLabel,
    };
  } else {
    const driveMins = Math.max(1, Math.ceil((distKm / 30) * 60));
    const driveLabel = `${driveMins} min drive (${roundedKm} km)`;
    return {
      distance_meters: distMeters,
      distance_km: roundedKm,
      driving_minutes: driveMins,
      driving_label: driveLabel,
    };
  }
};

// Convert 24h / 12h time string to minutes from midnight
const getMinutesFromMidnight = (timeStr) => {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(/[:\s]/);
  if (parts.length < 2) return 0;
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const ampm = String(timeStr).toUpperCase();
  if (ampm.includes('PM') && h < 12) h += 12;
  if (ampm.includes('AM') && h === 12) h = 0;
  return h * 60 + m;
};

// Format time string to 12h display
const formatTime12h = (timeStr, offsetMins = 0) => {
  let baseMins = getMinutesFromMidnight(timeStr);
  let totalMins = (baseMins + offsetMins) % (24 * 60);
  if (totalMins < 0) totalMins += 24 * 60;
  
  const h24 = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const displayH = h24 % 12 || 12;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

// ── Core Schedule Fetching Helper for Route + Stop Pair ────────
const fetchSchedulesForRouteStopPair = async ({ routeId, pickupStopId, dropStopId, travelDate, passengers }) => {
  const reqPassengers = parseInt(passengers || 1, 10);
  if (reqPassengers < 1) {
    return { success: false, reason: 'INVALID_PASSENGERS', schedules: [] };
  }
  
  const searchDateStr = travelDate || new Date().toISOString().split('T')[0];

  let route = await Route.findOne({
    where: { id: routeId, status: 'Active', deleted_at: null },
    include: [{ model: Stop, as: 'stops', required: false, where: { status: 'Active' } }],
  });

  if (!route) {
    route = await BusRoute.findOne({
      where: { id: routeId, status: 'Active' },
      include: [{ model: BusStop, as: 'stops', required: false, where: { status: 'Active' } }],
    });
  }

  if (!route) {
    console.log(`[REJECTION] Route ${routeId} not found or inactive`);
    return { success: false, reason: 'ROUTE_INACTIVE', schedules: [] };
  }

  const stops = (route.stops || []).sort((a, b) => (a.stop_sequence || 0) - (b.stop_sequence || 0));
  let pickupStop = stops.find((s) => Number(s.id) === Number(pickupStopId));
  let dropStop = stops.find((s) => Number(s.id) === Number(dropStopId));

  if (!pickupStop || !dropStop) {
    console.log(`[REJECTION] Pickup or drop stop invalid for route ${routeId}`);
    return { success: false, reason: 'INVALID_STOPS', schedules: [] };
  }

  if (Number(pickupStop.id) === Number(dropStop.id)) {
    console.log(`[REJECTION] Same stop requested: pickup ${pickupStop.id} === drop ${dropStop.id}`);
    return { success: false, reason: 'SAME_STOP', schedules: [] };
  }

  const pSeq = Number(pickupStop.stop_sequence || 1);
  const dSeq = Number(dropStop.stop_sequence || 2);

  if (pSeq >= dSeq) {
    console.log(`[REJECTION] Invalid sequence: pickup ${pSeq} >= drop ${dSeq}`);
    return { success: false, reason: 'INVALID_SEQUENCE', schedules: [] };
  }

  let rawSchedules = await BusSchedule.findAll({
    where: { route_id: route.id, status: 'Active' },
    include: [
      { model: BusType, as: 'bus_type', required: false },
    ],
    order: [['departure_time', 'ASC']],
  });

  if (!rawSchedules || rawSchedules.length === 0) {
    rawSchedules = await Trip.findAll({
      where: { route_id: route.id, status: ['Active', 'Scheduled'], deleted_at: null },
      include: [
        { model: BusType, as: 'bus_type', required: false },
        { model: Vehicle, as: 'vehicle', required: false },
      ],
      order: [['departure_time', 'ASC']],
    });
  }

  if (!rawSchedules || rawSchedules.length === 0) {
    console.log(`[REJECTION] No active schedules found for route ${route.id}`);
    return { success: false, reason: 'SCHEDULE_INACTIVE', schedules: [] };
  }

  const searchDateObj = new Date(searchDateStr);
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekday = weekdays[isNaN(searchDateObj.getDay()) ? 1 : searchDateObj.getDay()];

  const dayFilteredSchedules = rawSchedules.filter((sch) => {
    if (sch.trip_date && sch.trip_date === searchDateStr) return true;
    if (!sch.operating_days) return true;
    const operatingDays = String(sch.operating_days).toLowerCase().split(/[,:]/).map((d) => d.trim());
    return operatingDays.includes(weekday);
  });

  if (dayFilteredSchedules.length === 0) {
    console.log(`[REJECTION] No schedules operating on day ${weekday} (${searchDateStr})`);
    return { success: false, reason: 'SCHEDULE_NOT_RUNNING', schedules: [] };
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = searchDateStr === todayStr;
  const currentMinsFromMidnight = now.getHours() * 60 + now.getMinutes();

  let fareAmount = 49;
  try {
    const stopPairRate = await RateChart.findOne({
      where: {
        route_id: route.id,
        origin_stop_id: pickupStop.id,
        destination_stop_id: dropStop.id,
      },
    });
    if (stopPairRate && Number(stopPairRate.fare_amount) > 0) {
      fareAmount = Math.round(Number(stopPairRate.fare_amount));
    } else {
      const routeRate = await RateChart.findOne({
        where: { route_id: route.id, origin_stop_id: null, destination_stop_id: null },
      });
      if (routeRate && Number(routeRate.fare_amount) > 0) {
        fareAmount = Math.round(Number(routeRate.fare_amount));
      }
    }
  } catch (e) {
    fareAmount = 49;
  }

  const totalStops = Math.max(2, stops.length);
  const estDuration = Number(route.estimated_duration) || 60;
  const minsPerStop = Math.max(5, Math.round(estDuration / Math.max(1, totalStops - 1)));

  const pickupOffsetMins = (pSeq - 1) * minsPerStop;
  const dropOffsetMins = (dSeq - 1) * minsPerStop;
  const tripDurationMins = Math.max(10, dropOffsetMins - pickupOffsetMins);

  const validFormattedSchedules = [];

  for (const sch of dayFilteredSchedules) {
    const schId = Number(sch.id);
    const depTimeRaw = sch.departure_time || '07:35:00';
    const baseDepMins = getMinutesFromMidnight(depTimeRaw);
    const pickupMins = baseDepMins + pickupOffsetMins;

    if (isToday && pickupMins <= currentMinsFromMidnight) {
      console.log(`[REJECTION] Past departure for schedule ${schId}: pickupMins ${pickupMins} <= currentMins ${currentMinsFromMidnight}`);
      continue;
    }

    let bookedSeatsCount = sch.booked_seats || 0;
    try {
      const activeBookings = await Booking.findAll({
        where: {
          trip_id: sch.id,
          travel_date: searchDateStr,
          booking_status: { [Op.ne]: 'cancelled' },
        },
        attributes: ['total_seats', 'seat_numbers'],
      });
      if (activeBookings && activeBookings.length > 0) {
        bookedSeatsCount = activeBookings.reduce((sum, b) => sum + (b.total_seats || (b.seat_numbers ? b.seat_numbers.length : 1)), 0);
      }
    } catch (err) {
      // fallback
    }

    const seatCap = sch.vehicle?.total_seats || sch.bus_type?.total_seats || sch.seat_capacity || 30;
    const availSeats = Math.max(0, seatCap - bookedSeatsCount);

    if (availSeats < reqPassengers) {
      console.log(`[REJECTION] No seats for schedule ${schId}: available ${availSeats} < requested ${reqPassengers}`);
      continue;
    }

    const pickupTimeStr = formatTime12h(depTimeRaw, pickupOffsetMins);
    const dropTimeStr = formatTime12h(depTimeRaw, dropOffsetMins);

    validFormattedSchedules.push({
      schedule_id: schId,
      route_id: Number(route.id),
      bus_type_id: sch.bus_type_id || sch.bus_type?.id || null,
      bus_type: sch.bus_type || null,
      bus_number: sch.bus_number || sch.vehicle?.registration_number || null,
      pickup_stop: {
        id: Number(pickupStop.id),
        name: pickupStop.stop_name || pickupStop.name,
      },
      drop_stop: {
        id: Number(dropStop.id),
        name: dropStop.stop_name || dropStop.name,
      },
      pickup_time: pickupTimeStr,
      drop_time: dropTimeStr,
      duration_minutes: tripDurationMins,
      fare: {
        amount: fareAmount,
        currency: 'INR',
        display: `₹${fareAmount}`,
      },
      available_seats: availSeats,
      requested_seats: reqPassengers,
      booking_allowed: true,
      status: 'active',
      pickupMins,
    });
  }

  return {
    success: validFormattedSchedules.length > 0,
    reason: validFormattedSchedules.length > 0 ? 'SUCCESS' : 'NO_VALID_SCHEDULES',
    schedules: validFormattedSchedules,
    route,
    pickupStop,
    dropStop,
    fareAmount,
    durationMinutes: tripDurationMins,
  };
};

// ── 3. Search Routes with Filters ─────────────────────────────
exports.searchRoutes = async (req, res, next) => {
  try {
    const rawPickup = req.body?.pickup || req.query?.pickup;
    const rawDropoff = req.body?.dropoff || req.query?.dropoff;

    const pLatRaw = req.body?.pickup_latitude ?? req.query?.pickup_latitude ?? req.body?.pickup_lat ?? req.query?.pickup_lat;
    const pLngRaw = req.body?.pickup_longitude ?? req.query?.pickup_longitude ?? req.body?.pickup_lng ?? req.query?.pickup_lng;
    const dLatRaw = req.body?.dropoff_latitude ?? req.query?.dropoff_latitude ?? req.body?.dropoff_lat ?? req.query?.dropoff_lat;
    const dLngRaw = req.body?.dropoff_longitude ?? req.query?.dropoff_longitude ?? req.body?.dropoff_lng ?? req.query?.dropoff_lng;

    let pLat = pLatRaw !== undefined && pLatRaw !== null && pLatRaw !== '' ? parseFloat(pLatRaw) : NaN;
    let pLng = pLngRaw !== undefined && pLngRaw !== null && pLngRaw !== '' ? parseFloat(pLngRaw) : NaN;
    let dLat = dLatRaw !== undefined && dLatRaw !== null && dLatRaw !== '' ? parseFloat(dLatRaw) : NaN;
    let dLng = dLngRaw !== undefined && dLngRaw !== null && dLngRaw !== '' ? parseFloat(dLngRaw) : NaN;

    // STEP 1: Strict Validation - Required fields check
    const errors = {};
    if (isNaN(pLat) || isNaN(pLng)) {
      errors.pickup = 'Pickup latitude and longitude coordinates are required';
    }
    if (isNaN(dLat) || isNaN(dLng)) {
      errors.dropoff = 'Dropoff latitude and longitude coordinates are required';
    }
    if (!rawPickup || typeof rawPickup !== 'string' || !rawPickup.trim()) {
      errors.pickup_name = 'Pickup location name is required';
    }
    if (!rawDropoff || typeof rawDropoff !== 'string' || !rawDropoff.trim()) {
      errors.dropoff_name = 'Dropoff location name is required';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        status: false,
        message: 'Invalid or missing pickup/dropoff details',
        errors,
      });
    }

    const travelDate = req.body?.date || req.query?.date || req.body?.travel_date || req.query?.travel_date || new Date().toISOString().split('T')[0];
    const rawPassengers = req.body?.passengers ?? req.query?.passengers;
    const passengers = parseInt(rawPassengers !== undefined ? rawPassengers : 1, 10);

    const pickupStr = rawPickup.trim();
    const dropoffStr = rawDropoff.trim();

    console.log(`[SEARCH] Request passengers: ${passengers}, date: ${travelDate}, pickup: "${pickupStr}", dropoff: "${dropoffStr}"`);

    // STEP 1: Validation
    if (!validateCoordinates(pLat, pLng) || !validateCoordinates(dLat, dLng)) {
      return res.status(422).json({
        status: false,
        message: 'Invalid pickup or dropoff latitude/longitude coordinates',
        errors: {
          pickup: { latitude: pLatRaw, longitude: pLngRaw },
          dropoff: { latitude: dLatRaw, longitude: dLngRaw },
        },
      });
    }

    if (isNaN(passengers) || passengers < 1) {
      return res.status(422).json({
        status: false,
        message: 'Passengers count must be an integer greater than or equal to 1',
      });
    }

    // STEP 2 & 3: Find active routes and stops
    let routes = await Route.findAll({
      where: { status: 'Active', deleted_at: null },
      include: [{ model: Stop, as: 'stops', required: false, where: { status: 'Active' } }],
    });

    if (!routes || routes.length === 0) {
      routes = await BusRoute.findAll({
        where: { status: 'Active' },
        include: [{ model: BusStop, as: 'stops', required: false, where: { status: 'Active' } }],
      });
    }

    const validCandidates = [];

    for (const route of routes) {
      const stops = (route.stops || []).sort((a, b) => (a.stop_sequence || 0) - (b.stop_sequence || 0));
      if (stops.length < 2) continue;

      let bestPickupStop = null;
      let minPickupDistKm = Infinity;

      stops.forEach((s) => {
        const sLat = parseFloat(s.latitude);
        const sLng = parseFloat(s.longitude);
        if (!isNaN(sLat) && !isNaN(sLng)) {
          const distKm = calcHaversineDistanceKm(pLat, pLng, sLat, sLng);
          if (distKm <= PICKUP_SEARCH_RADIUS_KM && distKm < minPickupDistKm) {
            minPickupDistKm = distKm;
            bestPickupStop = s;
          }
        }
      });

      if (!bestPickupStop) {
        console.log(`[REJECTION] No pickup stop within ${PICKUP_SEARCH_RADIUS_KM}km for route ${route.id}`);
        continue;
      }

      const pSeq = Number(bestPickupStop.stop_sequence || 1);
      
      let bestDropStop = null;
      let minDropDistKm = Infinity;

      stops.forEach((s) => {
        const sSeq = Number(s.stop_sequence || 0);
        if (sSeq > pSeq && s.id !== bestPickupStop.id) {
          const sLat = parseFloat(s.latitude);
          const sLng = parseFloat(s.longitude);
          if (!isNaN(sLat) && !isNaN(sLng)) {
            const distKm = calcHaversineDistanceKm(dLat, dLng, sLat, sLng);
            if (distKm <= DROPOFF_SEARCH_RADIUS_KM && distKm < minDropDistKm) {
              minDropDistKm = distKm;
              bestDropStop = s;
            }
          }
        }
      });

      if (!bestDropStop) {
        console.log(`[REJECTION] DROP_STOP_TOO_FAR for route ${route.id}: No drop stop within ${DROPOFF_SEARCH_RADIUS_KM}km after pickup sequence ${pSeq}`);
        continue;
      }

      const scheduleRes = await fetchSchedulesForRouteStopPair({
        routeId: route.id,
        pickupStopId: bestPickupStop.id,
        dropStopId: bestDropStop.id,
        travelDate,
        passengers,
      });

      if (scheduleRes.success && scheduleRes.schedules.length > 0) {
        validCandidates.push({
          route,
          pickupStop: bestPickupStop,
          dropStop: bestDropStop,
          pickupDistKm: minPickupDistKm,
          dropDistKm: minDropDistKm,
          schedules: scheduleRes.schedules,
          durationMinutes: scheduleRes.durationMinutes,
          fareAmount: scheduleRes.fareAmount,
        });
      }
    }

    // STEP 14: Top Pick Deterministic Ranking
    validCandidates.sort((a, b) => {
      if (Math.abs(a.dropDistKm - b.dropDistKm) > 0.1) return a.dropDistKm - b.dropDistKm;
      if (Math.abs(a.pickupDistKm - b.pickupDistKm) > 0.1) return a.pickupDistKm - b.pickupDistKm;
      const aMinPickupTime = Math.min(...a.schedules.map((s) => s.pickupMins || 0));
      const bMinPickupTime = Math.min(...b.schedules.map((s) => s.pickupMins || 0));
      if (aMinPickupTime !== bMinPickupTime) return aMinPickupTime - bMinPickupTime;
      if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes;
      return a.fareAmount - b.fareAmount;
    });

    const pickupGroupMap = new Map();
    let allValidTimings = [];
    let topPickItem = null;

    validCandidates.forEach((cand, idx) => {
      const pDistInfo = formatDistanceAndLabel(cand.pickupDistKm);
      const dDistInfo = formatDistanceAndLabel(cand.dropDistKm);

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
              latitude: parseFloat(cand.pickupStop.latitude || pLat),
              longitude: parseFloat(cand.pickupStop.longitude || pLng),
              ...pDistInfo,
            },
            pickup_time: sch.pickup_time,
            drop_stop: {
              id: cand.dropStop.id,
              name: cand.dropStop.stop_name || cand.dropStop.name,
              address: cand.dropStop.address || cand.dropStop.landmark || '',
              latitude: parseFloat(cand.dropStop.latitude || dLat),
              longitude: parseFloat(cand.dropStop.longitude || dLng),
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

    const pickupGroups = Array.from(pickupGroupMap.values());

    // STEP 17: Available Dates calculation
    const availableDates = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const searchDateObj = new Date(travelDate);
    const baseDate = isNaN(searchDateObj.getTime()) ? new Date() : searchDateObj;

    for (let i = 0; i < 4; i++) {
      const dObj = new Date(baseDate);
      dObj.setDate(baseDate.getDate() + i);

      const yyyy = dObj.getFullYear();
      const mm = String(dObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dObj.getDate()).padStart(2, '0');
      const formattedDateStr = `${yyyy}-${mm}-${dd}`;

      let dateTimingsCount = 0;
      for (const cand of validCandidates) {
        const dRes = await fetchSchedulesForRouteStopPair({
          routeId: cand.route.id,
          pickupStopId: cand.pickupStop.id,
          dropStopId: cand.dropStop.id,
          travelDate: formattedDateStr,
          passengers,
        });
        if (dRes.success) {
          dateTimingsCount += dRes.schedules.length;
        }
      }

      if (dateTimingsCount > 0) {
        const dNum = dObj.getDate();
        let suffix = 'th';
        if (dNum % 10 === 1 && dNum !== 11) suffix = 'st';
        else if (dNum % 10 === 2 && dNum !== 12) suffix = 'nd';
        else if (dNum % 10 === 3 && dNum !== 13) suffix = 'rd';

        const label = `${days[dObj.getDay()]}, ${dNum}${suffix} ${months[dObj.getMonth()]}`;

        availableDates.push({
          date: formattedDateStr,
          label,
          timings_count: dateTimingsCount,
        });
      }
    }

    const uniqueRouteIds = new Set(validCandidates.map((c) => c.route.id));
    const uniquePickupStopIds = new Set(validCandidates.map((c) => c.pickupStop.id));

    // STEP 23: Empty Results Response if no valid timings found
    if (allValidTimings.length === 0) {
      return res.json({
        status: true,
        message: 'No shuttle timings found',
        search: {
          pickup: {
            name: pickupStr,
            latitude: pLat,
            longitude: pLng,
          },
          dropoff: {
            name: dropoffStr,
            latitude: dLat,
            longitude: dLng,
          },
          date: travelDate,
          passengers,
        },
        summary: {
          total_routes: 0,
          total_pickup_groups: 0,
          total_timings: 0,
          total_valid_results: 0,
        },
        top_pick: null,
        pickup_groups: [],
        available_dates: availableDates,
      });
    }

    return res.json({
      status: true,
      message: 'Shuttle timings found',
      search: {
        pickup: {
          name: pickupStr,
          latitude: pLat,
          longitude: pLng,
        },
        dropoff: {
          name: dropoffStr,
          latitude: dLat,
          longitude: dLng,
        },
        date: travelDate,
        passengers,
      },
      summary: {
        total_routes: uniqueRouteIds.size,
        total_pickup_groups: uniquePickupStopIds.size,
        total_timings: allValidTimings.length,
        total_valid_results: allValidTimings.length,
      },
      top_pick: topPickItem,
      pickup_groups: pickupGroups,
      available_dates: availableDates,
    });
  } catch (err) {
    next(err);
  }
};

// ── 4. Get Schedules ──────────────────────────────────────────
exports.getSchedules = async (req, res, next) => {
  try {
    const route_id = req.query?.route_id || req.body?.route_id;
    const pickup_stop_id = req.query?.pickup_stop_id || req.body?.pickup_stop_id;
    const drop_stop_id = req.query?.drop_stop_id || req.body?.drop_stop_id;
    const travel_date = req.query?.date || req.body?.date || req.query?.travel_date || req.body?.travel_date || '2026-10-05';
    const passengers = parseInt(req.query?.passengers || req.body?.passengers || 1, 10);

    if (route_id && pickup_stop_id && drop_stop_id) {
      const scheduleRes = await fetchSchedulesForRouteStopPair({
        routeId: route_id,
        pickupStopId: pickup_stop_id,
        dropStopId: drop_stop_id,
        travelDate: travel_date,
        passengers,
      });

      if (!scheduleRes.success) {
        return res.json({
          status: false,
          message: scheduleRes.reason || 'No schedules found',
          search: {
            route_id: Number(route_id),
            pickup_stop_id: Number(pickup_stop_id),
            drop_stop_id: Number(drop_stop_id),
            date: travel_date,
            passengers,
          },
          total: 0,
          schedules: [],
        });
      }

      return res.json({
        status: true,
        message: 'Schedules found',
        search: {
          route_id: Number(route_id),
          pickup_stop_id: Number(pickup_stop_id),
          drop_stop_id: Number(drop_stop_id),
          date: travel_date,
          passengers,
        },
        total: scheduleRes.schedules.length,
        schedules: scheduleRes.schedules,
      });
    }

    const rawTravelDate = req.query?.date || req.body?.date || req.query?.travel_date || req.body?.travel_date;
    const bus_type_id = req.query?.bus_type_id || req.body?.bus_type_id;
    const { Op } = require('sequelize');

    const where = {};
    if (route_id) where.route_id = route_id;
    if (bus_type_id) where.bus_type_id = bus_type_id;

    if (rawTravelDate) {
      where.trip_date = rawTravelDate;
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      where.trip_date = { [Op.gte]: todayStr };
    }

    let schedules = await BusSchedule.findAll({
      where,
      include: [
        { model: BusType, as: 'bus_type', required: false },
        { model: Route, as: 'main_route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        { model: BusRoute, as: 'route', include: [{ model: BusStop, as: 'stops', required: false }], required: false },
      ],
      order: [['trip_date', 'ASC'], ['departure_time', 'ASC']],
    });

    if (!schedules || schedules.length === 0) {
      const tripWhere = {};
      if (route_id) tripWhere.route_id = route_id;
      if (bus_type_id) tripWhere.bus_type_id = bus_type_id;
      if (rawTravelDate) {
        tripWhere.trip_date = rawTravelDate;
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        tripWhere.trip_date = { [Op.gte]: todayStr };
      }

      schedules = await Trip.findAll({
        where: tripWhere,
        include: [
          { model: BusType, as: 'bus_type', required: false },
          { model: Vehicle, as: 'vehicle', required: false },
          { model: Route, as: 'route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        ],
        order: [['trip_date', 'ASC'], ['departure_time', 'ASC']],
      });
    }

    // If no travel_date was passed and no future schedules exist, fetch latest active/scheduled trips
    if ((!schedules || schedules.length === 0) && !rawTravelDate) {
      const fallbackWhere = {};
      if (route_id) fallbackWhere.route_id = route_id;
      if (bus_type_id) fallbackWhere.bus_type_id = bus_type_id;

      schedules = await Trip.findAll({
        where: fallbackWhere,
        include: [
          { model: BusType, as: 'bus_type', required: false },
          { model: Vehicle, as: 'vehicle', required: false },
          { model: Route, as: 'route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        ],
        order: [['trip_date', 'DESC'], ['departure_time', 'ASC']],
      });
    }

    // Collect all distinct route IDs to lookup base_fare from rate_charts
    const routeIds = [...new Set((schedules || []).map((s) => s.route_id || (s.route && s.route.id)).filter(Boolean))];
    const rateCharts = routeIds.length > 0 ? await RateChart.findAll({ where: { route_id: routeIds } }) : [];

    // Map route_id -> rateChart fare_amount
    const routeFareMap = {};
    rateCharts.forEach((rc) => {
      const rId = Number(rc.route_id);
      const amt = parseFloat(rc.fare_amount);
      if (!isNaN(amt) && amt > 0) {
        // Prefer route-level rate_chart (where origin & dest stops are null) or first valid fare
        if (!routeFareMap[rId] || (rc.origin_stop_id === null && rc.destination_stop_id === null)) {
          routeFareMap[rId] = amt;
        }
      }
    });

    const formattedSchedules = (schedules || []).map((s) => {
      const item = s.toJSON();
      if (item.main_route) {
        item.route = item.main_route;
        delete item.main_route;
      }

      // Dynamic seat_capacity from vehicle total_seats or bus_type total_seats
      if (item.vehicle && item.vehicle.total_seats) {
        item.seat_capacity = Number(item.vehicle.total_seats);
      } else if (item.bus_type && item.bus_type.total_seats) {
        item.seat_capacity = Number(item.bus_type.total_seats);
      }

      const rId = Number(item.route_id || (item.route && item.route.id));
      if (routeFareMap[rId] !== undefined) {
        item.base_fare = routeFareMap[rId].toFixed(2);
      }

      return item;
    });

    res.json({
      status: true,
      message: 'Schedules retrieved successfully',
      data: formattedSchedules,
    });
  } catch (err) {
    next(err);
  }
};

// ── 5. Check Seat Availability ────────────────────────────────
exports.checkSeatAvailability = async (req, res, next) => {
  try {
    const rawScheduleId = req.query?.schedule_id || req.body?.schedule_id;
    const travel_date = req.query?.travel_date || req.body?.travel_date;

    if (!rawScheduleId || !travel_date) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'schedule_id and travel_date are required',
      });
    }

    const schedule_id = Number(rawScheduleId) || rawScheduleId;

    let schedule = await BusSchedule.findByPk(schedule_id, {
      include: [
        { model: BusType, as: 'bus_type', required: false },
        { model: Route, as: 'main_route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        { model: BusRoute, as: 'route', include: [{ model: BusStop, as: 'stops', required: false }], required: false },
      ],
    });

    if (!schedule) {
      schedule = await Trip.findByPk(schedule_id, {
        include: [
          { model: BusType, as: 'bus_type', required: false },
          { model: Vehicle, as: 'vehicle', required: false },
          { model: Route, as: 'route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        ],
      });
    }

    if (!schedule) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Schedule not found',
      });
    }

    // Determine trip ID for booking lookups
    let tripId = schedule.id;
    if (schedule.schedule_code) {
      const trip = await Trip.findOne({
        where: {
          schedule_code: schedule.schedule_code,
          trip_date: travel_date,
        },
      });
      if (trip) tripId = trip.id;
    }

    const bookings = await Booking.findAll({
      where: {
        trip_id: tripId,
        travel_date,
        booking_status: { [Op.ne]: 'cancelled' },
      },
      attributes: ['seat_numbers'],
    });

    const bookedSeats = new Set();
    bookings.forEach((booking) => {
      if (booking.seat_numbers && Array.isArray(booking.seat_numbers)) {
        booking.seat_numbers.forEach((seat) => bookedSeats.add(seat));
      }
    });

    const totalSeats = schedule.vehicle?.total_seats || schedule.bus_type?.total_seats || schedule.seat_capacity || 30;
    const availableSeats = totalSeats - bookedSeats.size;

    // Generate seat layout
    const seatLayout = [];
    const rows = schedule.bus_type?.seat_rows || 5;
    const columns = schedule.bus_type?.seat_columns || 4;

    for (let row = 1; row <= rows; row++) {
      for (let col = 1; col <= columns; col++) {
        const seatNumber = `${row}${String.fromCharCode(64 + col)}`;
        seatLayout.push({
          seat_number: seatNumber,
          row,
          column: col,
          is_available: !bookedSeats.has(seatNumber),
        });
      }
    }

    const routeInfo = schedule.main_route || schedule.route;

    res.json({
      status: 200,
      success: true,
      message: 'Seat availability checked successfully',
      data: {
        schedule_id: schedule.id,
        schedule_code: schedule.schedule_code,
        bus_number: schedule.bus_number || null,
        travel_date,
        total_seats: totalSeats,
        booked_seats: bookedSeats.size,
        available_seats: availableSeats,
        booked_seat_numbers: Array.from(bookedSeats),
        seat_layout: seatLayout,
        schedule: {
          departure_time: schedule.departure_time,
          arrival_time: schedule.arrival_time,
          bus_type: schedule.bus_type,
          route: routeInfo,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 6. Calculate Fare ─────────────────────────────────────────
exports.calculateFare = async (req, res, next) => {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const rawScheduleId = query.schedule_id || body.schedule_id;
    const origin_stop_id = query.origin_stop_id || body.origin_stop_id;
    const destination_stop_id = query.destination_stop_id || body.destination_stop_id;
    const rawSeatCount = query.seat_count || body.seat_count || 1;
    const seat_count = Number(rawSeatCount);
    if (!Number.isInteger(seat_count) || seat_count < 1) {
      return res.status(400).json({ status: 400, success: false, message: 'seat_count must be a positive integer' });
    }

    if (!rawScheduleId) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'schedule_id is required',
      });
    }

    const schedule_id = Number(rawScheduleId) || rawScheduleId;

    let schedule = await BusSchedule.findByPk(schedule_id, {
      include: [
        { model: Route, as: 'main_route', required: false },
        { model: BusRoute, as: 'route', required: false },
        { model: BusType, as: 'bus_type', required: false },
      ],
    });

    if (!schedule) {
      schedule = await Trip.findByPk(schedule_id, {
        include: [
          { model: Route, as: 'route', required: false },
          { model: BusType, as: 'bus_type', required: false },
        ],
      });
    }

    if (!schedule) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Schedule not found',
      });
    }

    const scheduleRoute = schedule.route;
    const isLegacyRoute = scheduleRoute
      && !Object.prototype.hasOwnProperty.call(scheduleRoute.dataValues || {}, 'route_stops');
    const route = schedule.main_route || (isLegacyRoute ? scheduleRoute : null);
    const distance = Number(route?.total_distance) || 100;
    const farePerKm = 0;
    const baseFare = 0;
    const fallbackFare = 0;
    const fareResult = await resolveFare({
      routeId: route?.id,
      originStopId: origin_stop_id,
      destinationStopId: destination_stop_id,
      fallbackFare,
    });
    if (fareResult.error) return res.status(400).json({ status: 400, success: false, message: fareResult.error });

    const farePerSeat = fareResult.fare;
    const finalAmount = farePerSeat * seat_count;

    res.json({
      status: 200,
      success: true,
      message: 'Fare calculated successfully',
      data: {
        schedule_id: schedule.id,
        schedule_code: schedule.schedule_code,
        origin_stop_id,
        destination_stop_id,
        distance_km: distance,
        base_fare: farePerSeat,
        seat_count,
        fare_per_seat: farePerSeat,
        total_fare: finalAmount,
        rate_source: fareResult.source,
        currency: 'INR',
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 7. Get User Bookings ───────────────────────────────────────
const calcDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const r = 6371000;
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
  return r * 2 * Math.asin(Math.sqrt(a));
};

exports.getUserBookings = async (req, res, next) => {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const passenger_id = query.passenger_id || body.passenger_id;
    const passenger_mobile = query.passenger_mobile || body.passenger_mobile;
    const booking_status = query.booking_status || body.booking_status;
    const travel_date = query.travel_date || body.travel_date;
    const page = query.page || body.page || 1;
    const limit = query.limit || body.limit || 20;

    const where = {};
    if (passenger_id) where.passenger_id = passenger_id;
    if (passenger_mobile) where.passenger_mobile = passenger_mobile;
    if (booking_status) where.booking_status = booking_status;
    if (travel_date) where.travel_date = travel_date;

    const { offset, limit: lim, page: p } = buildPagination(page, limit);

    const { count, rows } = await Booking.findAndCountAll({
      where,
      include: [
        {
          model: Trip,
          as: 'trip',
          include: [
            { model: Route, as: 'route', required: false },
            { model: Vehicle, as: 'vehicle', attributes: ['id', 'registration_number', 'company_model', 'color', 'latitude', 'longitude', 'status'], required: false },
            {
              model: Driver,
              as: 'driver',
              attributes: ['id', 'name', 'mobile'],
              include: [{ model: DriverDetail, as: 'details', attributes: ['latitude', 'longitude', 'location_speed_kmh', 'location_heading', 'updated_at'], required: false }],
              required: false,
            },
          ],
          required: false,
        },
        { model: Stop, as: 'origin_stop', attributes: ['id', 'stop_name', 'latitude', 'longitude', 'address'], required: false },
        { model: Stop, as: 'destination_stop', attributes: ['id', 'stop_name', 'latitude', 'longitude', 'address'], required: false },
        { model: CustomerUser, as: 'passenger', attributes: ['id', 'name', 'mobile', 'email'], required: false },
      ],
      offset,
      limit: lim,
      order: [['created_at', 'DESC']],
    });

    const enrichedBookings = rows.map((item) => {
      const b = item.toJSON();
      const trip = b.trip || {};
      const vehicle = trip.vehicle || {};
      const driver = trip.driver || {};
      const driverDetail = driver.details || {};
      const originStop = b.origin_stop || {};

      const rawBusLat = driverDetail.latitude != null ? driverDetail.latitude : vehicle.latitude;
      const rawBusLng = driverDetail.longitude != null ? driverDetail.longitude : vehicle.longitude;
      const busLat = rawBusLat != null && rawBusLat !== '' ? Number(rawBusLat) : null;
      const busLng = rawBusLng != null && rawBusLng !== '' ? Number(rawBusLng) : null;

      const rawStopLat = originStop.latitude;
      const rawStopLng = originStop.longitude;
      const stopLat = rawStopLat != null && rawStopLat !== '' ? Number(rawStopLat) : null;
      const stopLng = rawStopLng != null && rawStopLng !== '' ? Number(rawStopLng) : null;

      let distanceMeters = null;
      let etaMinutes = null;

      if (busLat != null && busLng != null && stopLat != null && stopLng != null && Number.isFinite(busLat) && Number.isFinite(busLng) && Number.isFinite(stopLat) && Number.isFinite(stopLng)) {
        distanceMeters = Math.round(calcDistanceMeters(busLat, busLng, stopLat, stopLng));
        const speedKmh = Number(driverDetail.location_speed_kmh) > 5 ? Number(driverDetail.location_speed_kmh) : 25;
        const speedMetersPerMin = (speedKmh * 1000) / 60;
        etaMinutes = Math.max(1, Math.round(distanceMeters / speedMetersPerMin));
      }

      b.tracking = {
        bus_status: trip.status || 'Scheduled',
        is_live: busLat != null && busLng != null && Number.isFinite(busLat) && Number.isFinite(busLng),
        current_location: busLat != null && busLng != null && Number.isFinite(busLat) && Number.isFinite(busLng) ? {
          latitude: busLat,
          longitude: busLng,
          speed_kmh: Number(driverDetail.location_speed_kmh || 0),
          heading: Number(driverDetail.location_heading || 0),
          updated_at: driverDetail.updated_at || null,
        } : null,
        pickup_stoppage: {
          id: originStop.id || null,
          name: originStop.stop_name || null,
          latitude: stopLat,
          longitude: stopLng,
          address: originStop.address || null,
        },
        distance_to_stoppage_meters: distanceMeters,
        distance_to_stoppage_text: distanceMeters != null ? (distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${distanceMeters} meters`) : 'N/A',
        eta_minutes: etaMinutes,
        eta_text: etaMinutes != null ? `${etaMinutes} mins` : 'N/A',
      };

      return b;
    });

    res.json({
      status: 200,
      success: true,
      message: 'User bookings retrieved successfully',
      data: enrichedBookings,
      pagination: {
        total: count,
        page: p,
        limit: lim,
        pages: Math.ceil(count / lim),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 8. Get Booking Details for Boarding Pass ───────────────────
exports.getBookingDetails = async (req, res, next) => {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const booking_id = query.booking_id || body.booking_id;
    const booking_reference = query.booking_reference || body.booking_reference;
    const boarding_pass_code = query.boarding_pass_code || body.boarding_pass_code;

    const where = {};
    if (booking_id) where.id = booking_id;
    if (booking_reference) where.booking_reference = booking_reference;
    if (boarding_pass_code) where.boarding_pass_code = boarding_pass_code;

    if (!booking_id && !booking_reference && !boarding_pass_code) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Either booking_id, booking_reference, or boarding_pass_code is required',
      });
    }

    const booking = await Booking.findOne({
      where,
      include: [
        { model: Trip, as: 'trip', include: [{ model: Route, as: 'route', required: false }], required: false },
        { model: Stop, as: 'origin_stop', attributes: ['id', 'stop_name', 'address'], required: false },
        { model: Stop, as: 'destination_stop', attributes: ['id', 'stop_name', 'address'], required: false },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Booking not found',
      });
    }

    // Format response for boarding pass
    const boardingPassData = {
      booking_id: booking.id,
      booking_reference: booking.booking_reference,
      passenger_name: booking.passenger_name,
      passenger_mobile: booking.passenger_mobile,
      passenger_email: booking.passenger_email,
      travel_date: booking.travel_date,
      seat_numbers: booking.seat_numbers,
      total_seats: booking.total_seats,
      total_fare: booking.total_fare,
      discount_amount: booking.discount_amount,
      final_amount: booking.final_amount,
      payment_status: booking.payment_status,
      booking_status: booking.booking_status,
      boarding_pass_code: booking.boarding_pass_code,
      boarding_pin: booking.boarding_pin,
      boarding_status: booking.boarding_status,
      boarded_at: booking.boarded_at,
      qr_token: booking.qr_token,
      trip: {
        trip_id: booking.trip?.id,
        schedule_code: booking.trip?.schedule_code,
        departure_time: booking.trip?.departure_time,
        arrival_time: booking.trip?.arrival_time,
        route: {
          route_name: booking.trip?.route?.route_name,
          origin_city: booking.trip?.route?.origin_city,
          destination_city: booking.trip?.route?.destination_city,
        },
      },
      origin_stop: booking.origin_stop,
      destination_stop: booking.destination_stop,
    };

    res.json({
      status: 200,
      success: true,
      message: 'Booking details retrieved successfully',
      data: boardingPassData,
    });
  } catch (err) {
    next(err);
  }
};

// ── 9. Cancel User Booking ────────────────────────────────────
exports.cancelUserBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { booking_id, cancellation_reason } = req.body || {};

    if (!booking_id) {
      await t.rollback();
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'booking_id is required',
      });
    }

    const booking = await Booking.findByPk(booking_id, { transaction: t });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Booking not found',
      });
    }

    if (booking.booking_status === 'cancelled') {
      await t.rollback();
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Booking already cancelled',
      });
    }

    await booking.update(
      {
        booking_status: 'cancelled',
        status: 'Cancelled',
        cancellation_reason: cancellation_reason || 'Cancelled by user',
        cancelled_at: new Date(),
      },
      { transaction: t }
    );

    // Decrement booked seats in trip
    const trip = await Trip.findByPk(booking.trip_id, { transaction: t });
    if (trip) {
      await trip.decrement('booked_seats', { by: booking.total_seats, transaction: t });
    }

    if (booking.payment_status === 'paid') {
      const passenger = booking.passenger_id
        ? await CustomerUser.findByPk(booking.passenger_id, { transaction: t })
        : await CustomerUser.findOne({ where: { mobile: booking.passenger_mobile }, transaction: t });
      const payment = await Payment.findOne({
        where: { booking_id: booking.id, status: ['captured', 'partial_refund'] },
        order: [['created_at', 'DESC']],
        transaction: t,
      });
      await Refund.create({
        booking_id: booking.id,
        payment_id: payment?.id || null,
        passenger_id: passenger?.id || booking.passenger_id,
        refund_reference: `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        refund_amount: booking.final_amount,
        refund_reason: cancellation_reason || 'Cancelled by user',
        status: 'pending',
      }, { transaction: t });
    }

    await t.commit();

    res.json({
      status: 200,
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking_id: booking.id,
        booking_reference: booking.booking_reference,
        booking_status: booking.booking_status,
        payment_status: booking.payment_status,
        cancelled_at: booking.cancelled_at,
      },
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// ── 10. Public Create Booking ──────────────────────────────────
exports.createBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const body = req.body || {};
    const {
      trip_id,
      schedule_id,
      passenger_id,
      passenger_name,
      passenger_mobile,
      passenger_email,
      origin_stop_id,
      destination_stop_id,
      travel_date,
      seat_numbers,
      total_seats,
      payment_method,
      use_wallet,
      coupon_id,
      special_requests
    } = body;

    const targetTripId = trip_id || schedule_id;

    if (!targetTripId) {
      await t.rollback();
      return res.status(400).json({ status: 400, success: false, message: 'trip_id or schedule_id is required' });
    }

    if (!Number.isInteger(Number(passenger_id)) || Number(passenger_id) <= 0) {
      await t.rollback();
      return res.status(400).json({ status: 400, success: false, message: 'A valid passenger_id is required' });
    }

    if (!passenger_name || !passenger_mobile) {
      await t.rollback();
      return res.status(400).json({ status: 400, success: false, message: 'passenger_name and passenger_mobile are required' });
    }

    const passengerUser = await CustomerUser.findOne({
      where: { id: passenger_id, mobile: String(passenger_mobile).trim() },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!passengerUser) {
      await t.rollback();
      return res.status(404).json({ status: 404, success: false, message: 'Passenger user was not found or mobile does not match' });
    }
    if (passengerUser.status === 'Inactive' || passengerUser.block_status === 'Block') {
      await t.rollback();
      return res.status(403).json({ status: 403, success: false, message: 'Passenger account is not active' });
    }

    let trip = await Trip.findByPk(targetTripId, {
      include: [
        { model: Vehicle, as: 'vehicle', required: false },
        { model: BusType, as: 'bus_type', required: false },
      ],
      transaction: t,
    });
    if (!trip) {
      const schedule = await BusSchedule.findByPk(targetTripId, {
        include: [
          { model: Vehicle, as: 'vehicle', required: false },
          { model: BusType, as: 'bus_type', required: false },
        ],
        transaction: t,
      });
      if (schedule) {
        trip = await Trip.findOne({
          where: { schedule_code: schedule.schedule_code, trip_date: travel_date || schedule.trip_date },
          include: [
            { model: Vehicle, as: 'vehicle', required: false },
            { model: BusType, as: 'bus_type', required: false },
          ],
          transaction: t
        });
      }
    }

    if (!trip) {
      await t.rollback();
      return res.status(404).json({ status: 404, success: false, message: 'Trip not found' });
    }

    const effectiveCapacity = trip.vehicle?.total_seats || trip.bus_type?.total_seats || trip.seat_capacity || 30;
    const numSeats = total_seats || (Array.isArray(seat_numbers) ? seat_numbers.length : 1);
    const available = effectiveCapacity - (trip.booked_seats || 0);
    if (available < numSeats) {
      await t.rollback();
      return res.status(409).json({ status: 409, success: false, message: `Only ${available} seats available` });
    }

    const fareResult = await resolveFare({
      routeId: trip.route_id,
      originStopId: origin_stop_id,
      destinationStopId: destination_stop_id,
      fallbackFare: trip.base_fare,
      transaction: t,
    });
    if (fareResult.error) {
      await t.rollback();
      return res.status(400).json({ status: 400, success: false, message: fareResult.error });
    }

    let total_fare = fareResult.fare * numSeats;
    let discount_amount = 0;

    if (coupon_id) {
      const coupon = await Coupon.findByPk(coupon_id, { transaction: t });
      if (coupon && coupon.status === 'Active') {
        if (coupon.code_type === 'FLAT') discount_amount = Math.min(coupon.amount, total_fare);
        else discount_amount = Math.min((total_fare * coupon.amount) / 100, coupon.max_discount || Infinity);
        await coupon.increment('used_count', { transaction: t });
      }
    }

    const final_amount = Math.max(0, total_fare - discount_amount);
    const walletPaymentRequested = use_wallet === true || String(use_wallet).toLowerCase() === 'true' || payment_method === 'wallet';
    let walletBalanceAfter = null;
    if (walletPaymentRequested) {
      const currentBalance = Number(passengerUser.wallet_balance || 0);
      if (currentBalance < final_amount) {
        await t.rollback();
        return res.status(409).json({
          status: 409,
          success: false,
          message: 'Insufficient wallet balance',
          data: { required_amount: final_amount, wallet_balance: currentBalance },
        });
      }
      walletBalanceAfter = Math.round((currentBalance - final_amount) * 100) / 100;
      await passengerUser.update({ wallet_balance: walletBalanceAfter }, { transaction: t });
    }

    const booking_reference = `BK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const boarding_pass_code = `BP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const boarding_pin = Math.floor(1000 + Math.random() * 9000).toString();

    const booking = await Booking.create({
      booking_reference,
      trip_id: trip.id,
      passenger_id: passengerUser.id,
      passenger_name,
      passenger_mobile,
      passenger_email: passenger_email || null,
      origin_stop_id: origin_stop_id || null,
      destination_stop_id: destination_stop_id || null,
      travel_date: travel_date || trip.trip_date,
      seat_numbers,
      total_seats: numSeats,
      total_fare,
      discount_amount,
      final_amount,
      payment_method: walletPaymentRequested ? 'wallet' : (payment_method || 'cash'),
      coupon_id: coupon_id || null,
      special_requests: special_requests || null,
      boarding_pass_code,
      boarding_pin,
      booking_status: 'confirmed',
      payment_status: walletPaymentRequested ? 'paid' : 'pending',
      qr_token: uuidv4(),
    }, { transaction: t });

    if (walletPaymentRequested) {
      await WalletTransaction.create({
        passenger_id: passengerUser.id,
        type: 'debit',
        amount: final_amount,
        balance_after: walletBalanceAfter,
        source: 'booking',
        reference_type: 'booking',
        reference_id: String(booking.id),
        description: `Wallet payment for booking ${booking_reference}`,
      }, { transaction: t });
      await Payment.create({
        booking_id: booking.id,
        passenger_id: passengerUser.id,
        amount: final_amount,
        currency: 'INR',
        payment_method: 'wallet',
        payment_gateway: 'wallet',
        status: 'captured',
        event: 'wallet_payment_captured',
        payload: { booking_reference },
      }, { transaction: t });
    }

    await trip.increment('booked_seats', { by: numSeats, transaction: t });

    await t.commit();
    const bookingData = booking.toJSON();
    res.status(201).json({
      status: 201,
      success: true,
      message: walletPaymentRequested ? 'Booking created and paid from wallet' : 'Booking created successfully',
      data: {
        booking_id: booking.id,
        ...bookingData,
        ...(walletPaymentRequested ? { wallet_balance: walletBalanceAfter } : {}),
      }
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};
