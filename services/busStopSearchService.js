'use strict';

const { Op } = require('sequelize');
const { Route, Stop, BusRoute, BusStop } = require('../models');

// Configuration parameters
const BUS_STOP_SEARCH_RADIUS_KM = 1.0; // 1000m default radius
const BUS_STOP_EXPANDED_RADIUS_KM = 3.0; // 3000m expanded radius
const FUZZY_MATCH_THRESHOLD = 0.60; // Similarity score threshold (0.0 - 1.0)

// Built-in Alias Dictionary mapping common synonyms/locations to registered stop names
const STOP_ALIAS_DICTIONARY = {
  'garia': ['new garia', 'garia station', 'garia more', 'garia bus stand', 'garia metro', 'gariya', 'newgaria'],
  'new garia': ['garia', 'garia station', 'newgaria', 'garia metro'],
  'newtown': ['new town', 'action area 1', 'action area 2', 'newtown bus stand', 'new-town', 'action area i'],
  'new town': ['newtown', 'action area 1', 'action area 2', 'newtown bus stand', 'new-town'],
  'sector v': ['sector 5', 'sec 5', 'saltlake sec 5', 'salt lake sector 5', 'sector-v', 'sec-v', 'sector 5 metro'],
  'tollygunge': ['tollygunge metro', 'tollygunge bus stand', 'tollygunje', 'tollygunj', 'tollyganj'],
  'bidhannagar': ['ultadanga', 'bidhannagar station', 'bidhan nagar', 'bidhannagar rly stn'],
  'gariahat': ['gariahat more', 'gariahat crossing', 'gariahat market'],
  'jadavpur': ['jadavpur 8b', 'jadavpur station', '8b bus stand', 'jadavpur university'],
  'mumbai central': ['mumbai', 'mumbai stn', 'mumbai c', 'mumbai central station'],
  'pune station': ['pune', 'pune stn', 'pune railway station'],
  'science city': ['science city bus stop', 'science city crossing'],
  'ruby': ['ruby general hospital', 'ruby crossing', 'ruby hospital', 'ruby more'],
};

/**
 * Geographic distance calculation using Haversine formula
 */
const calcHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const pLat1 = parseFloat(lat1);
  const pLon1 = parseFloat(lon1);
  const pLat2 = parseFloat(lat2);
  const pLon2 = parseFloat(lon2);
  if (isNaN(pLat1) || isNaN(pLon1) || isNaN(pLat2) || isNaN(pLon2)) return Infinity;

  const R = 6371; // Earth radius in km
  const dLat = (pLat2 - pLat1) * Math.PI / 180;
  const dLon = (pLon2 - pLon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(pLat1 * Math.PI / 180) * Math.cos(pLat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Text normalization (lowercase, trim, strip punctuation)
 */
const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Calculate similarity score between two strings
 */
const calculateSimilarity = (str1, str2) => {
  const norm1 = normalizeText(str1);
  const norm2 = normalizeText(str2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.85;

  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  const intersection = words1.filter((w) => words2.includes(w));
  if (intersection.length > 0) {
    const score = (2 * intersection.length) / (words1.length + words2.length);
    return score >= 0.5 ? score : 0.5;
  }

  // Bigram Dice Coefficient
  const getBigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const b1 = getBigrams(norm1);
  const b2 = getBigrams(norm2);
  let common = 0;
  for (const bg of b1) {
    if (b2.has(bg)) common++;
  }
  return (2 * common) / (b1.size + b2.size || 1);
};

/**
 * Format distance labeling
 */
const formatDistance = (distKm) => {
  if (distKm === Infinity || isNaN(distKm)) return { distance: null, distance_km: null, label: '', formatted: '' };
  const distMeters = Math.round(distKm * 1000);
  const roundedKm = Number(distKm.toFixed(2));

  if (distKm <= 1.0) {
    const walkMins = Math.max(1, Math.ceil(distMeters / 80));
    const walkLabel = distMeters <= 100 ? 'less than a min walk' : `${walkMins} min walk`;
    return {
      distance: distMeters,
      distance_km: roundedKm,
      label: walkLabel,
      formatted: `${distMeters}m (${walkLabel})`,
    };
  } else {
    const driveMins = Math.max(1, Math.ceil(distKm * 2));
    return {
      distance: distMeters,
      distance_km: roundedKm,
      label: `${driveMins} min drive`,
      formatted: `${roundedKm} km (${driveMins} min drive)`,
    };
  }
};

/**
 * Load all active stops from database
 */
const getAllActiveStops = async () => {
  let stops = await Stop.findAll({
    where: { status: 'Active' },
    raw: true,
  });

  if (!stops || stops.length === 0) {
    stops = await BusStop.findAll({
      where: { status: 'Active' },
      raw: true,
    });
  }

  return stops.map((s) => ({
    id: Number(s.id),
    stop_id: Number(s.id),
    route_id: Number(s.route_id),
    stop_name: s.stop_name || s.name || 'Bus Stop',
    name: s.stop_name || s.name || 'Bus Stop',
    latitude: s.latitude !== null ? parseFloat(s.latitude) : null,
    longitude: s.longitude !== null ? parseFloat(s.longitude) : null,
    stop_sequence: Number(s.stop_sequence || 0),
    stop_code: s.stop_code || null,
    address: s.address || null,
    landmark: s.landmark || null,
    pickup_allowed: s.pickup_allowed !== undefined ? Boolean(s.pickup_allowed) : true,
    dropoff_allowed: s.dropoff_allowed !== undefined ? Boolean(s.dropoff_allowed) : true,
  }));
};

/**
 * Location Resolver Pipeline:
 * Priority: 1. stop_id -> 2. GPS -> 3. Exact Name -> 4. Alias -> 5. Substring -> 6. Fuzzy -> 7. GPS Nearby
 */
const resolveLocation = async (input, role = 'pickup') => {
  const allStops = await getAllActiveStops();
  if (allStops.length === 0) return [];

  let inputStopId = null;
  let inputName = '';
  let inputLat = null;
  let inputLng = null;

  if (typeof input === 'number' || (typeof input === 'string' && /^\d+$/.test(input.trim()))) {
    inputStopId = Number(input);
  } else if (typeof input === 'string') {
    inputName = input.trim();
  } else if (typeof input === 'object' && input !== null) {
    if (input.stop_id || input.id) inputStopId = Number(input.stop_id || input.id);
    if (input.name || input.stop_name || input.pickup_name || input.dropoff_name) {
      inputName = String(input.name || input.stop_name || input.pickup_name || input.dropoff_name).trim();
    }
    const lat = input.latitude ?? input.lat;
    const lng = input.longitude ?? input.lng;
    if (lat != null && !isNaN(parseFloat(lat))) inputLat = parseFloat(lat);
    if (lng != null && !isNaN(parseFloat(lng))) inputLng = parseFloat(lng);
  }

  // 1. Priority: Explicit stop_id
  if (inputStopId) {
    const matchedById = allStops.filter((s) => s.id === inputStopId || s.stop_id === inputStopId);
    if (matchedById.length > 0) {
      return matchedById.map((s) => {
        const distKm = inputLat != null && inputLng != null ? calcHaversineDistanceKm(inputLat, inputLng, s.latitude, s.longitude) : 0;
        const distInfo = formatDistance(distKm);
        return {
          ...s,
          matched_by: 'stop_id',
          confidence: 1.0,
          input_name: inputName || s.name,
          matched_alias: null,
          ...distInfo,
        };
      });
    }
  }

  const queryNorm = normalizeText(inputName);
  const hasGps = inputLat !== null && inputLng !== null;

  // Filter out stops based on pickup/dropoff allowed flag if specified
  const eligibleStops = allStops.filter((s) => role === 'pickup' ? s.pickup_allowed : s.dropoff_allowed);
  const candidates = [];

  for (const s of eligibleStops) {
    const stopNameNorm = normalizeText(s.name);
    const landmarkNorm = normalizeText(s.landmark);
    const addressNorm = normalizeText(s.address);

    const distKm = hasGps ? calcHaversineDistanceKm(inputLat, inputLng, s.latitude, s.longitude) : Infinity;
    const distInfo = formatDistance(distKm);

    let matchType = null;
    let confidence = 0.0;
    let matchedAlias = null;

    if (queryNorm) {
      if (stopNameNorm === queryNorm) {
        matchType = 'exact';
        confidence = 1.0;
      } else if (STOP_ALIAS_DICTIONARY[stopNameNorm]?.map(normalizeText).includes(queryNorm)) {
        matchType = 'alias';
        confidence = 0.95;
        matchedAlias = inputName;
      } else if (STOP_ALIAS_DICTIONARY[queryNorm]?.map(normalizeText).includes(stopNameNorm)) {
        matchType = 'alias';
        confidence = 0.95;
        matchedAlias = s.name;
      } else if (stopNameNorm.includes(queryNorm) || queryNorm.includes(stopNameNorm)) {
        matchType = 'contains';
        confidence = 0.85;
      } else if (landmarkNorm && landmarkNorm.includes(queryNorm)) {
        matchType = 'landmark';
        confidence = 0.80;
      } else {
        const sim = calculateSimilarity(queryNorm, stopNameNorm);
        if (sim >= FUZZY_MATCH_THRESHOLD) {
          matchType = 'fuzzy';
          confidence = sim;
        }
      }
    }

    if (!matchType && hasGps && distKm <= BUS_STOP_SEARCH_RADIUS_KM) {
      matchType = 'gps_nearby';
      confidence = Math.max(0.5, 1.0 - (distKm / BUS_STOP_SEARCH_RADIUS_KM) * 0.4);
    }

    if (matchType) {
      candidates.push({
        ...s,
        matched_by: matchType,
        confidence,
        input_name: inputName,
        matched_alias: matchedAlias,
        ...distInfo,
      });
    }
  }

  // Fallback: If no candidate match found by name but GPS is available, expand radius to 3km
  if (candidates.length === 0 && hasGps) {
    for (const s of eligibleStops) {
      const distKm = calcHaversineDistanceKm(inputLat, inputLng, s.latitude, s.longitude);
      if (distKm <= BUS_STOP_EXPANDED_RADIUS_KM) {
        const distInfo = formatDistance(distKm);
        candidates.push({
          ...s,
          matched_by: 'gps_expanded',
          confidence: 0.4,
          input_name: inputName,
          matched_alias: null,
          ...distInfo,
        });
      }
    }
  }

  // Sort candidates by match priority & distance
  const matchPriorityOrder = { stop_id: 1, exact: 2, alias: 3, contains: 4, landmark: 5, fuzzy: 6, gps_nearby: 7, gps_expanded: 8 };
  candidates.sort((a, b) => {
    const pA = matchPriorityOrder[a.matched_by] || 99;
    const pB = matchPriorityOrder[b.matched_by] || 99;
    if (pA !== pB) return pA - pB;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (a.distance_km || 0) - (b.distance_km || 0);
  });

  return candidates;
};

/**
 * Stop Suggestion API Endpoint (/api2/bus/search-stops)
 */
const searchStopsSuggestions = async (req, res, next) => {
  try {
    const query = req.body?.query || req.query?.query || req.body?.search || req.query?.search || '';
    const latRaw = req.body?.latitude ?? req.query?.latitude ?? req.body?.lat ?? req.query?.lat;
    const lngRaw = req.body?.longitude ?? req.query?.longitude ?? req.body?.lng ?? req.query?.lng;

    const lat = latRaw != null && !isNaN(parseFloat(latRaw)) ? parseFloat(latRaw) : null;
    const lng = lngRaw != null && !isNaN(parseFloat(lngRaw)) ? parseFloat(lngRaw) : null;

    const candidates = await resolveLocation({ name: query, latitude: lat, longitude: lng }, 'pickup');

    // Deduplicate by stop_name
    const seenNames = new Set();
    const suggestions = [];

    candidates.forEach((c) => {
      const nameKey = normalizeText(c.name);
      if (!seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        suggestions.push({
          stop_id: c.id,
          name: c.name,
          display_name: c.name,
          matched_alias: c.matched_alias,
          matched_by: c.matched_by,
          latitude: c.latitude,
          longitude: c.longitude,
          distance: c.distance,
          distance_km: c.distance_km,
          distance_label: c.label,
        });
      }
    });

    res.json({
      status: true,
      success: true,
      message: 'Bus stops retrieved successfully',
      query: query || null,
      data: suggestions,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  BUS_STOP_SEARCH_RADIUS_KM,
  BUS_STOP_EXPANDED_RADIUS_KM,
  FUZZY_MATCH_THRESHOLD,
  calcHaversineDistanceKm,
  normalizeText,
  calculateSimilarity,
  formatDistance,
  getAllActiveStops,
  resolveLocation,
  searchStopsSuggestions,
};
