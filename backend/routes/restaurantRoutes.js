const express = require('express');
const {
  getAllRestaurants,
  getRestaurantById,
  getRestaurantMenu,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
} = require('../controllers/restaurantController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminAuth');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

router.get('/', getAllRestaurants);
router.get('/:id/menu', validateObjectId('id'), getRestaurantMenu);
router.get('/:id', validateObjectId('id'), getRestaurantById);
router.post('/', protect, requireAdmin, createRestaurant);
router.put('/:id', protect, requireAdmin, validateObjectId('id'), updateRestaurant);
router.delete('/:id', protect, requireAdmin, validateObjectId('id'), deleteRestaurant);

module.exports = router;
