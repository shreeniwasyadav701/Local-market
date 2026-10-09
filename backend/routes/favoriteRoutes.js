const express = require('express');
const {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavoriteStatus,
  clearFavorites,
} = require('../controllers/favoriteController');
const { protect } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

router.use(protect);

router.get('/', getFavorites);
router.delete('/', clearFavorites);
router.post('/:foodId', validateObjectId('foodId'), addFavorite);
router.get('/:foodId/status', validateObjectId('foodId'), checkFavoriteStatus);
router.delete('/:foodId', validateObjectId('foodId'), removeFavorite);

module.exports = router;
