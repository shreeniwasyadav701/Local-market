const express = require('express');
const {
  placeOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  updateStatus,
  trackOrder,
} = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminAuth');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

router.use(protect);

router.get('/', getMyOrders);
router.post('/', placeOrder);
router.patch('/:orderId/status', validateObjectId('orderId'), requireAdmin, updateStatus);
router.get('/:orderId/tracking', validateObjectId('orderId'), trackOrder);
router.get('/:id', validateObjectId('id'), getOrderById);
router.put('/:id/cancel', validateObjectId('id'), cancelOrder);

module.exports = router;
