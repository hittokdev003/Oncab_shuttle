'use strict';

const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize, Driver, BusType, BusRoute, BusStop, BusSchedule, BusDriverAssignment } = require('../models');

const assignmentIncludes = [
  {
    model: BusSchedule,
    as: 'schedule',
    include: [
      { model: BusRoute, as: 'route', include: [{ model: BusStop, as: 'stops' }] },
      { model: BusType, as: 'bus_type' },
    ],
  },
];

const todayDate = () => new Date().toISOString().slice(0, 10);

const parseAssignmentDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const getEligibleDriver = async (driverId) => {
  const driver = await Driver.findByPk(driverId);
  if (!driver) return { error: [404, 'Driver not found'] };
  if (!driver.is_bus_driver) {
    return { error: [403, 'This account is not registered as a bus driver'] };
  }
  if (!driver.preferred_bus_type_id) return { error: [403, 'A preferred bus type is required'] };
  if (driver.status !== 'Approve') return { error: [403, 'Driver account must be approved'] };
  if (driver.complete_status !== 'Complete') return { error: [403, 'Complete driver documents before accepting assignments'] };
  return { driver };
};

const respondForEligibility = (res, result) => {
  if (!result.error) return false;
  res.status(result.error[0]).json({ status: result.error[0], success: false, message: result.error[1] });
  return true;
};

const scheduleCanRunOnDate = (schedule, date) => {
  const dateText = date.toISOString().slice(0, 10);
  if (schedule.valid_from && schedule.valid_from > dateText) return false;
  if (schedule.valid_until && schedule.valid_until < dateText) return false;
  if (schedule.trip_date && schedule.trip_date !== dateText) return false;

  const operatingDays = String(schedule.operating_days || '').toLowerCase().split(/[,:]/).map((day) => day.trim());
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()];
  return operatingDays.includes(weekday);
};

exports.getAvailableSchedules = async (req, res, next) => {
  try {
    const eligibility = await getEligibleDriver(req.driver.id);
    if (respondForEligibility(res, eligibility)) return;

    const requestedDate = req.body?.assignment_date || req.query?.assignment_date;
    const date = requestedDate ? parseAssignmentDate(requestedDate) : null;
    if (requestedDate && (!date || date < new Date(`${todayDate()}T00:00:00.000Z`))) {
      return res.status(400).json({ status: 400, success: false, message: 'assignment_date must be a valid date today or later' });
    }

    const existingAssignments = await BusDriverAssignment.findAll({
      attributes: ['schedule_id'],
      where: {
        driver_id: req.driver.id,
        assignment_date: { [Op.gte]: todayDate() },
        status: { [Op.ne]: 'cancelled' },
      },
    });
    const assignedScheduleIds = [...new Set(existingAssignments.map((item) => String(item.schedule_id)))];
    const where = {
      bus_type_id: eligibility.driver.preferred_bus_type_id,
      status: 'Active',
    };
    if (assignedScheduleIds.length) where.id = { [Op.notIn]: assignedScheduleIds };

    const schedules = await BusSchedule.findAll({
      where,
      include: [
        { model: BusRoute, as: 'route', include: [{ model: BusStop, as: 'stops' }] },
        { model: BusType, as: 'bus_type' },
      ],
      order: [['departure_time', 'ASC']],
    });
    const available = date ? schedules.filter((schedule) => scheduleCanRunOnDate(schedule, date)) : schedules;

    res.json({ status: 200, success: true, message: 'Available schedules retrieved successfully', data: available });
  } catch (err) {
    next(err);
  }
};

exports.acceptAssignment = async (req, res, next) => {
  try {
    const eligibility = await getEligibleDriver(req.driver.id);
    if (respondForEligibility(res, eligibility)) return;

    const scheduleId = Number(req.body?.schedule_id);
    const assignmentDate = req.body?.assignment_date;
    const date = parseAssignmentDate(assignmentDate);
    if (!Number.isInteger(scheduleId) || scheduleId < 1 || !date || assignmentDate < todayDate()) {
      return res.status(400).json({ status: 400, success: false, message: 'Valid schedule_id and assignment_date (today or later) are required' });
    }

    const schedule = await BusSchedule.findByPk(scheduleId);
    if (!schedule || schedule.status !== 'Active') {
      return res.status(404).json({ status: 404, success: false, message: 'Active bus schedule not found' });
    }
    if (String(schedule.bus_type_id) !== String(eligibility.driver.preferred_bus_type_id)) {
      return res.status(403).json({ status: 403, success: false, message: 'Schedule bus type does not match your preferred bus type' });
    }
    if (!scheduleCanRunOnDate(schedule, date)) {
      return res.status(400).json({ status: 400, success: false, message: 'Schedule is not valid for the selected date' });
    }

    const transaction = await sequelize.transaction();
    try {
      const existing = await BusDriverAssignment.findOne({
        where: { schedule_id: scheduleId, assignment_date: assignmentDate },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existing && existing.status !== 'cancelled') {
        await transaction.rollback();
        return res.status(409).json({ status: 409, success: false, message: 'Schedule already assigned to another driver for this date' });
      }

      const assignment = existing
        ? await existing.update({
          driver_id: req.driver.id,
          reporting_time: schedule.departure_time,
          status: 'assigned',
          start_odometer: null,
          end_odometer: null,
          notes: null,
        }, { transaction })
        : await BusDriverAssignment.create({
          schedule_id: scheduleId,
          driver_id: req.driver.id,
          assignment_date: assignmentDate,
          reporting_time: schedule.departure_time,
          status: 'assigned',
        }, { transaction });

      await transaction.commit();
      await assignment.reload({ include: assignmentIncludes });
      res.status(201).json({ status: 201, success: true, message: 'Assignment accepted successfully', data: assignment });
    } catch (err) {
      await transaction.rollback();
      if (err instanceof UniqueConstraintError) {
        return res.status(409).json({ status: 409, success: false, message: 'Schedule already assigned to another driver for this date' });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

exports.getMyAssignments = async (req, res, next) => {
  try {
    const where = { driver_id: req.driver.id };
    if (req.query.status) where.status = req.query.status;
    if (req.query.upcoming === 'true') where.assignment_date = { [Op.gte]: todayDate() };

    const assignments = await BusDriverAssignment.findAll({
      where,
      include: assignmentIncludes,
      order: [['assignment_date', 'DESC'], ['reporting_time', 'ASC']],
    });
    const data = assignments.map((assignment) => {
      const item = assignment.toJSON();
      item.distance_km = item.start_odometer !== null && item.end_odometer !== null
        ? Number((Number(item.end_odometer) - Number(item.start_odometer)).toFixed(2))
        : null;
      return item;
    });
    res.json({ status: 200, success: true, message: 'Assignments retrieved successfully', data });
  } catch (err) {
    next(err);
  }
};

exports.startAssignment = async (req, res, next) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId < 1) {
      return res.status(400).json({ status: 400, success: false, message: 'A valid assignment_id is required' });
    }
    const rawStartOdometer = req.body?.start_odometer;
    const startOdometer = Number(rawStartOdometer);
    if (rawStartOdometer === null || rawStartOdometer === '' || !Number.isFinite(startOdometer) || startOdometer <= 0) {
      return res.status(400).json({ status: 400, success: false, message: 'A valid positive start_odometer is required' });
    }
    const assignment = await BusDriverAssignment.findOne({ where: { id: assignmentId, driver_id: req.driver.id } });
    if (!assignment) return res.status(404).json({ status: 404, success: false, message: 'Assignment not found' });
    if (assignment.status !== 'assigned') return res.status(409).json({ status: 409, success: false, message: 'Only assigned trips can be started' });

    await assignment.update({ status: 'started', start_odometer: startOdometer });
    res.json({ status: 200, success: true, message: 'Assignment started successfully', data: assignment });
  } catch (err) {
    next(err);
  }
};

exports.completeAssignment = async (req, res, next) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId < 1) {
      return res.status(400).json({ status: 400, success: false, message: 'A valid assignment_id is required' });
    }
    const rawEndOdometer = req.body?.end_odometer;
    const endOdometer = Number(rawEndOdometer);
    if (rawEndOdometer === null || rawEndOdometer === '' || !Number.isFinite(endOdometer) || endOdometer <= 0) {
      return res.status(400).json({ status: 400, success: false, message: 'A valid positive end_odometer is required' });
    }
    const assignment = await BusDriverAssignment.findOne({ where: { id: assignmentId, driver_id: req.driver.id } });
    if (!assignment) return res.status(404).json({ status: 404, success: false, message: 'Assignment not found' });
    if (assignment.status !== 'started') return res.status(409).json({ status: 409, success: false, message: 'Only started assignments can be completed' });
    if (endOdometer <= Number(assignment.start_odometer)) {
      return res.status(400).json({ status: 400, success: false, message: 'end_odometer must be greater than start_odometer' });
    }

    await assignment.update({ status: 'completed', end_odometer: endOdometer, ...(req.body?.notes !== undefined ? { notes: req.body.notes } : {}) });
    res.json({ status: 200, success: true, message: 'Assignment completed successfully', data: assignment });
  } catch (err) {
    next(err);
  }
};

exports.cancelAssignment = async (req, res, next) => {
  try {
    const assignment = await BusDriverAssignment.findOne({ where: { id: req.params.id, driver_id: req.driver.id } });
    if (!assignment) return res.status(404).json({ status: 404, success: false, message: 'Assignment not found' });
    if (assignment.status !== 'assigned') return res.status(409).json({ status: 409, success: false, message: 'Only assigned trips can be cancelled' });

    await assignment.update({ status: 'cancelled' });
    res.json({ status: 200, success: true, message: 'Assignment cancelled successfully', data: assignment });
  } catch (err) {
    next(err);
  }
};

exports.startTrip = async (req, res, next) => {
  req.params.id = req.body?.assignment_id;
  return exports.startAssignment(req, res, next);
};

exports.completeTrip = async (req, res, next) => {
  req.params.id = req.body?.assignment_id;
  return exports.completeAssignment(req, res, next);
};