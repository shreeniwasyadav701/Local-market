const mongoose = require('mongoose');
const Food = require('../models/Food');
const Restaurant = require('../models/Restaurant');
const { ApiError } = require('../middleware/errorHandler');
const { escapeRegex, parsePagination, parseSort } = require('../utils/helpers');
const { FOOD_CATEGORIES, FOOD_SORTS } = require('../utils/constants');

const FOOD_LIST_FIELDS = 'name description price image category restaurant isVeg';

const getAllFoods = async (req, res, next) => {
  try {
    const { search, category, isVeg, restaurant: legacyRestaurant } = req.query;
    const filter = { isAvailable: true };

    const restaurantParam =
      req.query.restaurantId !== undefined ? req.query.restaurantId : legacyRestaurant;

    if (restaurantParam !== undefined) {
      if (!mongoose.isValidObjectId(restaurantParam)) {
        throw new ApiError(400, `Invalid restaurant id: ${restaurantParam}`);
      }

      const exists = await Restaurant.findOne({ _id: restaurantParam, isActive: true });
      if (!exists) {
        throw new ApiError(404, 'Restaurant not found');
      }

      filter.restaurant = exists._id;
    } else {
      const activeRestaurantIds = await Restaurant.distinct('_id', { isActive: true });
      filter.restaurant = { $in: activeRestaurantIds };
    }

    if (search) {
      const keyword = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: keyword }, { description: keyword }];
    }

    if (category) {
      const canonical = FOOD_CATEGORIES.find(
        (c) => c.toLowerCase() === String(category).trim().toLowerCase()
      );
      if (!canonical) {
        throw new ApiError(400, `Invalid category: ${category}. Allowed values: ${FOOD_CATEGORIES.join(', ')}`);
      }
      filter.category = canonical;
    }

    if (isVeg === 'true') filter.isVeg = true;
    if (isVeg === 'false') filter.isVeg = false;

    const { valid, sort } = parseSort(req.query, FOOD_SORTS);
    if (!valid) {
      throw new ApiError(
        400,
        `Invalid sort option: ${req.query.sort}. Allowed values: ${Object.keys(FOOD_SORTS).join(', ')}`
      );
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [foods, total] = await Promise.all([
      Food.find(filter).select(FOOD_LIST_FIELDS).sort(sort || { name: 1 }).skip(skip).limit(limit),
      Food.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: foods.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: foods,
      pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

const getFoodById = async (req, res, next) => {
  try {
    const food = await Food.findOne({ _id: req.params.id, isAvailable: true }).populate({
      path: 'restaurant',
      match: { isActive: true },
      select: 'name image rating deliveryTime deliveryFee address',
    });

    if (!food || !food.restaurant) {
      throw new ApiError(404, 'Food item not found');
    }

    return res.status(200).json({ success: true, data: food });
  } catch (error) {
    return next(error);
  }
};

const createFood = async (req, res, next) => {
  try {
    const { name, description, price, image, category, restaurant, isVeg, isAvailable } = req.body;

    if (!restaurant || !mongoose.isValidObjectId(restaurant)) {
      throw new ApiError(400, 'A valid restaurant id is required');
    }

    const restaurantDoc = await Restaurant.findOne({ _id: restaurant, isActive: true });
    if (!restaurantDoc) {
      throw new ApiError(400, 'Restaurant does not exist or is inactive');
    }

    const food = await Food.create({
      name,
      description,
      price,
      image,
      category,
      restaurant: restaurantDoc._id,
      isVeg,
      isAvailable,
    });

    return res.status(201).json({
      success: true,
      message: 'Food item created',
      data: food,
    });
  } catch (error) {
    return next(error);
  }
};

const updateFood = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'description', 'price', 'image', 'category', 'restaurant', 'isVeg', 'isAvailable'];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No updatable fields provided');
    }

    if (updates.restaurant !== undefined) {
      if (!mongoose.isValidObjectId(updates.restaurant)) {
        throw new ApiError(400, 'A valid restaurant id is required');
      }
      const exists = await Restaurant.findOne({ _id: updates.restaurant, isActive: true });
      if (!exists) {
        throw new ApiError(400, 'Restaurant does not exist or is inactive');
      }
    }

    const food = await Food.findOneAndUpdate({ _id: req.params.id }, updates, {
      new: true,
      runValidators: true,
    });

    if (!food) {
      throw new ApiError(404, 'Food item not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Food item updated',
      data: food,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteFood = async (req, res, next) => {
  try {
    const food = await Food.findOneAndUpdate(
      { _id: req.params.id, isAvailable: true },
      { isAvailable: false },
      { new: true }
    );

    if (!food) {
      throw new ApiError(404, 'Food item not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Food item removed',
      data: { id: food._id, name: food.name, isAvailable: food.isAvailable },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAllFoods, getFoodById, createFood, updateFood, deleteFood };
