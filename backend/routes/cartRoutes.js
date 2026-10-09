const express = require('express');
const { getCart, addToCart, updateQuantity, removeItem, clearCart } = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getCart);
router.post('/', addToCart);
router.put('/:itemId', updateQuantity);
router.delete('/:itemId', removeItem);
router.delete('/', clearCart);

module.exports = router;
