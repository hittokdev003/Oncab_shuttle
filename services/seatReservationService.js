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
  static async checkSeatConflict({ tripId, travelDate, requestedSeats, transaction }) {
    if (!tripId || !requestedSeats || requestedSeats.length === 0) {
      return { hasConflict: false, bookedSeats: [] };
    }

    const whereObj = {
      trip_id: tripId,
      booking_status: { [Op.ne]: 'cancelled' },
      status: { [Op.ne]: 'Cancelled' },
    };
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
      if (bookedSeatsSet.has(reqSeat)) {
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
