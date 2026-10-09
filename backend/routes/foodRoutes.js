const express = require('express');
const { getAllFoods, getFoodById, createFood, updateFood, deleteFood } = require('../controllers/foodController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminAuth');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

router.get('/', getAllFoods);
router.get('/:id', validateObjectId('id'), getFoodById);
router.post('/', protect, requireAdmin, createFood);
router.put('/:id', protect, requireAdmin, validateObjectId('id'), updateFood);
router.delete('/:id', protect, requireAdmin, validateObjectId('id'), deleteFood);

module.exports = router;
