const Restaurant = require('../models/Restaurant');
const Food = require('../models/Food');
const { ApiError } = require('../middleware/errorHandler');
const { escapeRegex, parsePagination } = require('../utils/helpers');

const RESTAURANT_FIELDS = [
  'name',
  'description',
  'image',
  'cuisine',
  'rating',
  'deliveryTime',
  'deliveryFee',
  'minOrder',
  'address',
  'isOpen',
];

const getAdminRestaurants = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.search) {
      const keyword = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ name: keyword }, { cuisine: keyword }, { address: keyword }];
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [restaurants, totalItems] = await Promise.all([
      Restaurant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Restaurant.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: restaurants.length,
      restaurants,
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminRestaurantById = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findOne({ _id: req.params.restaurantId });
    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }

    const foods = await Food.find({ restaurant: restaurant._id }).sort({ category: 1, price: 1 });

    return res.status(200).json({
      success: true,
      data: { restaurant, foods },
    });
  } catch (error) {
    return next(error);
  }
};

const createRestaurant = async (req, res, next) => {
  try {
    const body = req.body || {};
    const errors = [];
    const data = {};

    for (const field of RESTAURANT_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    if (!data.name || !String(data.name).trim()) errors.push('Restaurant name is required');
    if (!data.address || !String(data.address).trim()) errors.push('Address is required');
    if (data.cuisine !== undefined && (!Array.isArray(data.cuisine) || data.cuisine.length === 0)) {
      errors.push('cuisine must be a non-empty array, for example ["Chinese", "Snacks"]');
    }
    if (errors.length > 0) throw new ApiError(400, errors.join(', '));

    if (data.deliveryTime === undefined) data.deliveryTime = 30;

    const restaurant = await Restaurant.create(data);

    return res.status(201).json({
      success: true,
      message: 'Restaurant created',
      data: restaurant,
    });
  } catch (error) {
    return next(error);
  }
};

const updateRestaurant = async (req, res, next) => {
  try {
    const body = req.body || {};
    const errors = [];
    const updates = {};

    for (const field of RESTAURANT_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No updatable fields provided');
    }
    if (updates.name !== undefined && !String(updates.name).trim()) {
      errors.push('name cannot be empty');
    }
    if (updates.address !== undefined && !String(updates.address).trim()) {
      errors.push('address cannot be empty');
    }
    if (updates.cuisine !== undefined && (!Array.isArray(updates.cuisine) || updates.cuisine.length === 0)) {
      errors.push('cuisine must be a non-empty array');
    }
    if (errors.length > 0) throw new ApiError(400, errors.join(', '));

    const restaurant = await Restaurant.findOneAndUpdate({ _id: req.params.restaurantId }, updates, {
      new: true,
      runValidators: true,
    });

    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Restaurant updated',
      data: restaurant,
    });
  } catch (error) {
    return next(error);
  }
};

const removeRestaurant = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findOne({ _id: req.params.restaurantId });
    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }

    if (!restaurant.isActive) {
      return res.status(200).json({
        success: true,
        message: 'Restaurant already removed',
        data: { id: restaurant._id, isActive: restaurant.isActive, foodsKept: await Food.countDocuments({ restaurant: restaurant._id }) },
      });
    }

    const foodsKept = await Food.countDocuments({ restaurant: restaurant._id });
    restaurant.isActive = false;
    restaurant.isOpen = false;
    await restaurant.save();

    return res.status(200).json({
      success: true,
      message: 'Restaurant removed (soft delete, food and order records kept intact)',
      data: { id: restaurant._id, isActive: restaurant.isActive, foodsKept },
    });
  } catch (error) {
    return next(error);
  }
};

const updateRestaurantStatus = async (req, res, next) => {
  try {
    const { status, isActive } = req.body || {};
    let value;

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        throw new ApiError(400, 'isActive must be a boolean');
      }
      value = isActive;
    } else if (status !== undefined) {
      const normalized = String(status).trim().toLowerCase();
      if (!['active', 'inactive'].includes(normalized)) {
        throw new ApiError(400, `Invalid status value: ${status}. Allowed values: ACTIVE, INACTIVE`);
      }
      value = normalized === 'active';
    } else {
      throw new ApiError(400, 'Provide status (ACTIVE/INACTIVE) or isActive (boolean)');
    }

    const restaurant = await Restaurant.findOneAndUpdate(
      { _id: req.params.restaurantId },
      { isActive: value },
      { new: true, runValidators: true }
    );

    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }

    return res.status(200).json({
      success: true,
      message: `Restaurant is now ${value ? 'active' : 'inactive'}`,
      data: restaurant,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminRestaurants,
  getAdminRestaurantById,
  createRestaurant,
  updateRestaurant,
  removeRestaurant,
  updateRestaurantStatus,
};
