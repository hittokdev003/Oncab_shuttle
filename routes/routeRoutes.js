'use strict';

const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const stopController = require('../controllers/stopController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ── Physical Stop Master APIs ─────────────────────────────────────────
router.get('/stops/search', stopController.search);
router.get('/stops/nearby-check', stopController.nearbyCheck);
router.get('/stops', stopController.list);
router.get('/stops/:id', stopController.show);
router.post('/stops', stopController.create);
router.put('/stops/:id', stopController.update);
router.delete('/stops/:id', stopController.destroy);

// ── Route Management APIs ─────────────────────────────────────────────
router.get('/', requirePermission('routes.read'), routeController.list);
router.get('/:id', requirePermission('routes.read'), routeController.show);
router.post('/', requirePermission('routes.manage'), routeController.create);
router.put('/:id', requirePermission('routes.manage'), routeController.update);
router.post('/:id/duplicate', requirePermission('routes.manage'), routeController.duplicate);
router.post('/:id/reverse', requirePermission('routes.manage'), routeController.reverse);
router.delete('/:id', requirePermission('routes.manage'), routeController.destroy);
router.delete('/:id/stops/:stopId', requirePermission('routes.manage'), routeController.deleteStop);

module.exports = router;
