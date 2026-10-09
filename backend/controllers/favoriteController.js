const mongoose = require('mongoose');
const Favorite = require('../models/Favorite');
const Food = require('../models/Food');
const Restaurant = require('../models/Restaurant');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/helpers');

const FOOD_SELECT = 'name description price image category isVeg isAvailable restaurant';
const RESTAURANT_SELECT = 'name image rating deliveryTime deliveryFee address isOpen';

const addFavorite = async (req, res, next) => {
  try {
    const { foodId } = req.params;

    const food = await Food.findById(foodId);
    if (!food || !food.isAvailable) {
      throw new ApiError(404, 'Food item not found or unavailable');
    }

    const restaurant = await Restaurant.findById(food.restaurant).select('isActive');
    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }
    if (!restaurant.isActive) {
      throw new ApiError(400, 'This restaurant is currently not accepting orders');
    }

    const existing = await Favorite.findOne({ user: req.user._id, food: food._id });
    if (existing) {
      throw new ApiError(409, 'Food already in favorites');
    }

    try {
      await Favorite.create({ user: req.user._id, food: food._id });
    } catch (error) {
      if (error.code === 11000) {
        throw new ApiError(409, 'Food already in favorites');
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: 'Food added to favorites',
    });
  } catch (error) {
    return next(error);
  }
};

const getFavorites = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [favorites, totalItems] = await Promise.all([
      Favorite.find({ user: req.user._id })
        .select('-user')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'food',
          select: FOOD_SELECT,
          populate: { path: 'restaurant', select: RESTAURANT_SELECT },
        }),
      Favorite.countDocuments({ user: req.user._id }),
    ]);

    const data = favorites
      .filter((favorite) => favorite.food)
      .map((favorite) => ({
        _id: favorite._id,
        food: favorite.food,
        createdAt: favorite.createdAt,
      }));

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

const removeFavorite = async (req, res, next) => {
  try {
    const { foodId } = req.params;

    const favorite = await Favorite.findOneAndDelete({ user: req.user._id, food: foodId });
    if (!favorite) {
      throw new ApiError(404, 'Favorite not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Food removed from favorites',
    });
  } catch (error) {
    return next(error);
  }
};

const checkFavoriteStatus = async (req, res, next) => {
  try {
    const { foodId } = req.params;

    const favorite = await Favorite.exists({ user: req.user._id, food: foodId });

    return res.status(200).json({
      success: true,
      isFavorite: Boolean(favorite),
    });
  } catch (error) {
    return next(error);
  }
};

const clearFavorites = async (req, res, next) => {
  try {
    const result = await Favorite.deleteMany({ user: req.user._id });

    return res.status(200).json({
      success: true,
      message: 'Favorites cleared',
      data: { removed: result.deletedCount },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  addFavorite,
  getFavorites,
  removeFavorite,
  checkFavoriteStatus,
  clearFavorites,
};
