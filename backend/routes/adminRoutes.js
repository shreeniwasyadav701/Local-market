const express = require('express');
const { getAdminOrders, getAdminOrderById } = require('../controllers/adminController');
const {
  getAdminRestaurants,
  getAdminRestaurantById,
  createRestaurant,
  updateRestaurant,
  removeRestaurant,
  updateRestaurantStatus,
} = require('../controllers/adminRestaurantController');
const {
  getAdminFoods,
  getAdminFoodById,
  createFood,
  updateFood,
  removeFood,
  updateFoodStatus,
} = require('../controllers/adminFoodController');
const { updateStatus } = require('../controllers/orderController');
const { getAdminPayments, refundPayment } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminAuth');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

router.use(protect, requireAdmin);

router.get('/orders', getAdminOrders);
router.get('/orders/:orderId', validateObjectId('orderId'), getAdminOrderById);
router.patch('/orders/:orderId/status', validateObjectId('orderId'), updateStatus);

router.get('/payments', getAdminPayments);
router.patch('/payments/:paymentId/refund', validateObjectId('paymentId'), refundPayment);

router.get('/restaurants', getAdminRestaurants);
router.get('/restaurants/:restaurantId', validateObjectId('restaurantId'), getAdminRestaurantById);
router.post('/restaurants', createRestaurant);
router.put('/restaurants/:restaurantId', validateObjectId('restaurantId'), updateRestaurant);
router.delete('/restaurants/:restaurantId', validateObjectId('restaurantId'), removeRestaurant);
router.patch('/restaurants/:restaurantId/status', validateObjectId('restaurantId'), updateRestaurantStatus);

router.get('/foods', getAdminFoods);
router.get('/foods/:foodId', validateObjectId('foodId'), getAdminFoodById);
router.post('/foods', createFood);
router.put('/foods/:foodId', validateObjectId('foodId'), updateFood);
router.delete('/foods/:foodId', validateObjectId('foodId'), removeFood);
router.patch('/foods/:foodId/status', validateObjectId('foodId'), updateFoodStatus);

module.exports = router;
