const mongoose = require('mongoose');
const Food = require('../models/Food');
const Restaurant = require('../models/Restaurant');
const { ApiError } = require('../middleware/errorHandler');
const { escapeRegex, parsePagination } = require('../utils/helpers');
const { FOOD_CATEGORIES } = require('../utils/constants');

const FOOD_FIELDS = ['name', 'description', 'price', 'image', 'category', 'isVeg', 'isAvailable'];

const validateFoodFields = (body, { requireName = true } = {}) => {
  const errors = [];

  if (requireName && (!body.name || !String(body.name).trim())) {
    errors.push('Food name is required');
  }
  if (body.price !== undefined && (typeof body.price !== 'number' || body.price < 1)) {
    errors.push('price must be a number and at least 1');
  }
  if (body.category !== undefined && !FOOD_CATEGORIES.includes(body.category)) {
    errors.push(`category must be one of: ${FOOD_CATEGORIES.join(', ')}`);
  }

  return errors;
};

const getAdminFoods = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.search) {
      const keyword = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ name: keyword }, { description: keyword }];
    }

    if (req.query.restaurantId !== undefined) {
      if (!mongoose.isValidObjectId(req.query.restaurantId)) {
        throw new ApiError(400, `Invalid restaurant id: ${req.query.restaurantId}`);
      }
      const exists = await Restaurant.findById(req.query.restaurantId);
      if (!exists) {
        throw new ApiError(404, 'Restaurant not found');
      }
      filter.restaurant = exists._id;
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [foods, totalItems] = await Promise.all([
      Food.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Food.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: foods.length,
      foods,
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminFoodById = async (req, res, next) => {
  try {
    const food = await Food.findOne({ _id: req.params.foodId }).populate(
      'restaurant',
      'name address isActive'
    );

    if (!food) {
      throw new ApiError(404, 'Food item not found');
    }

    return res.status(200).json({ success: true, data: food });
  } catch (error) {
    return next(error);
  }
};

const createFood = async (req, res, next) => {
  try {
    const body = req.body || {};
    const errors = validateFoodFields(body);

    const restaurantId = body.restaurantId !== undefined ? body.restaurantId : body.restaurant;
    if (!restaurantId) {
      errors.push('restaurantId is required');
    } else if (!mongoose.isValidObjectId(restaurantId)) {
      errors.push(`Invalid restaurant id: ${restaurantId}`);
    }

    if (errors.length > 0) throw new ApiError(400, errors.join(', '));

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      throw new ApiError(400, 'Restaurant does not exist');
    }

    const data = { restaurant: restaurant._id };
    for (const field of FOOD_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    const food = await Food.create(data);

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
    const body = req.body || {};
    const errors = validateFoodFields(body, { requireName: false });

    const updates = {};
    for (const field of FOOD_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (body.restaurantId !== undefined) updates.restaurant = body.restaurantId;

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No updatable fields provided');
    }
    if (updates.name !== undefined && !String(updates.name).trim()) {
      errors.push('name cannot be empty');
    }

    if (errors.length > 0) throw new ApiError(400, errors.join(', '));

    if (updates.restaurant !== undefined) {
      if (!mongoose.isValidObjectId(updates.restaurant)) {
        throw new ApiError(400, `Invalid restaurant id: ${updates.restaurant}`);
      }
      const exists = await Restaurant.findById(updates.restaurant);
      if (!exists) {
        throw new ApiError(400, 'Restaurant does not exist');
      }
    }

    const food = await Food.findOneAndUpdate({ _id: req.params.foodId }, updates, {
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

const removeFood = async (req, res, next) => {
  try {
    const food = await Food.findOne({ _id: req.params.foodId });
    if (!food) {
      throw new ApiError(404, 'Food item not found');
    }

    if (!food.isAvailable) {
      return res.status(200).json({
        success: true,
        message: 'Food item already removed',
        data: { id: food._id, name: food.name, isAvailable: food.isAvailable },
      });
    }

    food.isAvailable = false;
    await food.save();

    return res.status(200).json({
      success: true,
      message: 'Food item removed (soft delete, order history kept intact)',
      data: { id: food._id, name: food.name, isAvailable: food.isAvailable },
    });
  } catch (error) {
    return next(error);
  }
};

const updateFoodStatus = async (req, res, next) => {
  try {
    const { isAvailable, status } = req.body || {};
    let value;

    if (isAvailable !== undefined) {
      if (typeof isAvailable !== 'boolean') {
        throw new ApiError(400, 'isAvailable must be a boolean');
      }
      value = isAvailable;
    } else if (status !== undefined) {
      const normalized = String(status).trim().toLowerCase();
      if (!['available', 'unavailable'].includes(normalized)) {
        throw new ApiError(400, `Invalid status value: ${status}. Allowed values: AVAILABLE, UNAVAILABLE`);
      }
      value = normalized === 'available';
    } else {
      throw new ApiError(400, 'Provide isAvailable (boolean) or status (AVAILABLE/UNAVAILABLE)');
    }

    const food = await Food.findOneAndUpdate(
      { _id: req.params.foodId },
      { isAvailable: value },
      { new: true, runValidators: true }
    );

    if (!food) {
      throw new ApiError(404, 'Food item not found');
    }

    return res.status(200).json({
      success: true,
      message: `Food item is now ${value ? 'available' : 'unavailable'}`,
      data: food,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminFoods,
  getAdminFoodById,
  createFood,
  updateFood,
  removeFood,
  updateFoodStatus,
};
