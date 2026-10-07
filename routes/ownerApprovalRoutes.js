'use strict';

const express = require('express');
const router = express.Router();
const ownerApprovalController = require('../controllers/ownerApprovalController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);
router.post('/', requireRole('owner'), ownerApprovalController.create);
router.get('/mine', requireRole('owner'), ownerApprovalController.mine);
router.get('/', requireRole('admin'), ownerApprovalController.list);
router.patch('/:id/review', requireRole('admin'), ownerApprovalController.review);

module.exports = router;
