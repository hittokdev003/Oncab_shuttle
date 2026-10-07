'use strict';

const { v4: uuidv4 } = require('uuid');
const { Trip, Vehicle, BusType } = require('../models');
const SeatReservationService = require('./seatReservationService');

const createHttpError = (message, status, code) => Object.assign(new Error(message), { status, code });

const confirmPaidBooking = async ({ booking, transaction }) => {
  if (booking.booking_status === 'cancelled') {
    throw createHttpError('Cancelled booking cannot be confirmed', 409, 'BOOKING_CANCELLED');
  }
  if (Number(booking.final_amount || 0) > 0 && booking.payment_status !== 'paid') {
    throw createHttpError('Payment is required before confirming this booking', 409, 'PAYMENT_REQUIRED');
  }
  const wasAlreadyAllocated = booking.booking_status === 'confirmed' && booking.payment_status === 'paid';
  if (wasAlreadyAllocated && booking.qr_token && booking.boarding_pass_code && booking.boarding_pin) return booking;

  const trip = await Trip.findByPk(booking.trip_id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!trip) throw createHttpError('Trip not found for booking', 404, 'TRIP_NOT_FOUND');

  const requestedSeats = SeatReservationService.parseSeatNumbers(booking.seat_numbers);
  const conflict = await SeatReservationService.checkSeatConflict({
    tripId: trip.id,
    travelDate: booking.travel_date,
    requestedSeats,
    excludeBookingId: booking.id,
    transaction,
  });
  if (conflict.hasConflict) {
    throw createHttpError(`Seat ${conflict.conflictingSeat} is no longer available`, 409, 'SEAT_ALREADY_BOOKED');
  }

  const vehicle = trip.vehicle_id ? await Vehicle.findByPk(trip.vehicle_id, { transaction }) : null;
  const busType = trip.bus_type_id ? await BusType.findByPk(trip.bus_type_id, { transaction }) : null;
  const seatCount = Math.max(1, Number(booking.total_seats) || requestedSeats.length || 1);
  const capacity = Number(vehicle?.total_seats || busType?.total_seats || 30);
  if (!wasAlreadyAllocated && Number(trip.booked_seats || 0) + seatCount > capacity) {
    throw createHttpError('There are no seats remaining on this trip', 409, 'TRIP_CAPACITY_REACHED');
  }

  await booking.update({
    payment_status: 'paid',
    booking_status: 'confirmed',
    status: 'Active',
    boarding_pass_code: `BP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    boarding_pin: Math.floor(1000 + Math.random() * 9000).toString(),
    qr_token: uuidv4(),
  }, { transaction });
  if (!wasAlreadyAllocated) await trip.increment('booked_seats', { by: seatCount, transaction });
  return booking;
};

module.exports = { confirmPaidBooking };
