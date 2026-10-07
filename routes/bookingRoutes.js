'use strict';

const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/cancelled', requirePermission('bookings.read'), bookingController.cancelledList);
router.get('/', requirePermission('bookings.read'), bookingController.list);
router.get('/:id', requirePermission('bookings.read'), bookingController.show);
router.get('/:id/track', requirePermission('bookings.read'), bookingController.track);
router.post('/', requirePermission('bookings.manage'), bookingController.create);
router.patch('/:id/cancel', requirePermission('bookings.manage'), bookingController.cancel);
router.patch('/:id/payment', requirePermission('bookings.manage'), bookingController.updatePayment);
module.exports = router;
