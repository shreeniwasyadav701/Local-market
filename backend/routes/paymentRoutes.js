const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');
const {
  createMockPayment,
  getPaymentForOrder,
  listMyPayments,
} = require('../controllers/paymentController');

const router = express.Router();

router.use(protect);

router.post('/mock', createMockPayment);
router.get('/order/:orderId', validateObjectId('orderId'), getPaymentForOrder);
router.get('/', listMyPayments);

module.exports = router;
