'use strict';

const { Op } = require('sequelize');
const { Booking, Trip, BusSchedule, Vehicle, BusType, Stop } = require('../models');

class SeatReservationService {
  /**
   * Helper to normalize seat inputs into a clean array of uppercase seat numbers
   */
  static parseSeatNumbers(input) {
    if (!input) return [];
    let list = [];
    if (Array.isArray(input)) {
      list = input;
    } else if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        list = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        list = input.split(/[,;\s]+/);
      }
    } else {
      list = [input];
    }
    return list
      .map((s) => (s != null ? String(s).trim().toUpperCase() : ''))
      .filter((s) => s.length > 0);
  }

  /**
   * Check if any requested seat is already booked for a specific trip_id
   */
  static async checkSeatConflict({ tripId, travelDate, requestedSeats, excludeBookingId, transaction }) {
    if (!tripId || !requestedSeats || requestedSeats.length === 0) {
      return { hasConflict: false, bookedSeats: [] };
    }

    const tripIds = new Set([Number(tripId)]);
    const target = (await Trip.findByPk(tripId, { transaction })) || (await BusSchedule.findByPk(tripId, { transaction }));
    
    const matchConditions = [{ id: Number(tripId) }];
    if (target) {
      if (target.id) matchConditions.push({ id: Number(target.id) });
      if (target.schedule_code) matchConditions.push({ schedule_code: target.schedule_code });
      if (target.route_id && target.departure_time) {
        matchConditions.push({ route_id: target.route_id, departure_time: target.departure_time });
      }
    }

    if (matchConditions.length > 0) {
      const relatedTrips = await Trip.findAll({
        where: { [Op.or]: matchConditions },
        attributes: ['id'],
        transaction,
      });
      const relatedSchedules = await BusSchedule.findAll({
        where: { [Op.or]: matchConditions },
        attributes: ['id'],
        transaction,
      });
      relatedTrips.forEach((t) => tripIds.add(Number(t.id)));
      relatedSchedules.forEach((s) => tripIds.add(Number(s.id)));
    }

    const validTripIds = Array.from(tripIds).filter((id) => id != null && !isNaN(id));

    const whereObj = {
      trip_id: validTripIds,
      booking_status: 'confirmed',
      payment_status: { [Op.in]: ['paid', 'partial_refund', 'refunded'] },
      status: { [Op.notIn]: ['Cancelled', 'cancelled', 'CANCELLED', 'Payment Failed'] },
    };
    if (excludeBookingId) whereObj.id = { [Op.ne]: Number(excludeBookingId) };
    if (travelDate) {
      whereObj.travel_date = travelDate;
    }

    const existingBookings = await Booking.findAll({
      where: whereObj,
      attributes: ['id', 'seat_numbers', 'booking_reference'],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : false,
    });

    const bookedSeatsSet = new Set();
    existingBookings.forEach((b) => {
      const parsed = SeatReservationService.parseSeatNumbers(b.seat_numbers);
      parsed.forEach((seat) => bookedSeatsSet.add(seat));
    });

    for (const reqSeat of requestedSeats) {
      let conflict = bookedSeatsSet.has(reqSeat);

      if (!conflict && /^\d+[A-Z]$/i.test(reqSeat)) {
        const row = parseInt(reqSeat, 10);
        const colChar = reqSeat.slice(String(row).length).toUpperCase();
        const col = colChar.charCodeAt(0) - 64;
        const seatIndex = (row - 1) * 4 + col;
        if (bookedSeatsSet.has(String(seatIndex)) || bookedSeatsSet.has(`${colChar}${row}`)) {
          conflict = true;
        }
      } else if (!conflict && /^\d+$/.test(reqSeat)) {
        const idx = parseInt(reqSeat, 10);
        const row = Math.ceil(idx / 4);
        const col = ((idx - 1) % 4) + 1;
        const seatNum = `${row}${String.fromCharCode(64 + col)}`;
        const altSeatNum = `${String.fromCharCode(64 + col)}${row}`;
        if (bookedSeatsSet.has(seatNum) || bookedSeatsSet.has(altSeatNum)) {
          conflict = true;
        }
      }

      if (conflict) {
        return {
          hasConflict: true,
          conflictingSeat: reqSeat,
          bookedSeats: Array.from(bookedSeatsSet),
        };
      }
    }

    return {
      hasConflict: false,
      bookedSeats: Array.from(bookedSeatsSet),
    };
  }
}

module.exports = SeatReservationService;
