const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getCheckout } = require('../controllers/checkoutController');

const router = express.Router();

router.use(protect);
router.get('/', getCheckout);

module.exports = router;
