'use strict';

const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requirePermission('trips.read'), tripController.list);
router.get('/:id', requirePermission('trips.read'), tripController.show);
router.post('/', requirePermission('trips.manage'), tripController.create);
router.put('/:id', requirePermission('trips.manage'), tripController.update);
router.delete('/:id', requirePermission('trips.manage'), tripController.destroy);
router.patch('/:id/status', requirePermission('trips.manage'), tripController.updateStatus);
router.patch('/:id/assign-driver', requirePermission('trips.manage'), tripController.assignDriver);
router.patch('/:id/assign-vehicle', requirePermission('trips.manage'), tripController.assignVehicle);
router.post('/generate-future', requirePermission('trips.manage'), tripController.generateFutureTrips);
module.exports = router;
