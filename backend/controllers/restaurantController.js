const Restaurant = require('../models/Restaurant');
const Food = require('../models/Food');
const { ApiError } = require('../middleware/errorHandler');
const { escapeRegex, parsePagination, parseSort } = require('../utils/helpers');
const { RESTAURANT_SORTS } = require('../utils/constants');

const RESTAURANT_LIST_FIELDS = 'name description image cuisine rating deliveryTime deliveryFee minOrder address isOpen';

const getAllRestaurants = async (req, res, next) => {
  try {
    const { search, cuisine, isOpen } = req.query;
    const filter = { isActive: true };

    if (search) {
      const keyword = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: keyword }, { description: keyword }, { cuisine: keyword }];
    }

    if (cuisine) {
      filter.cuisine = new RegExp(`^${escapeRegex(cuisine)}$`, 'i');
    }

    if (isOpen === 'true') filter.isOpen = true;
    if (isOpen === 'false') filter.isOpen = false;

    const { valid, sort } = parseSort(req.query, RESTAURANT_SORTS);
    if (!valid) {
      throw new ApiError(
        400,
        `Invalid sort option: ${req.query.sort}. Allowed values: ${Object.keys(RESTAURANT_SORTS).join(', ')}`
      );
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [restaurants, total] = await Promise.all([
      Restaurant.find(filter)
        .select(RESTAURANT_LIST_FIELDS)
        .sort(sort || { rating: -1, name: 1 })
        .skip(skip)
        .limit(limit),
      Restaurant.countDocuments(filter),
    ]);

    let foodCounts = {};
    if (restaurants.length > 0) {
      const counts = await Food.aggregate([
        { $match: { restaurant: { $in: restaurants.map((r) => r._id) }, isAvailable: true } },
        { $group: { _id: '$restaurant', count: { $sum: 1 } } },
      ]);
      foodCounts = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    }

    const data = restaurants.map((r) => ({
      ...r.toObject(),
      foodCount: foodCounts[String(r._id)] || 0,
    }));

    return res.status(200).json({
      success: true,
      count: data.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data,
      pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

const getRestaurantById = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findOne({ _id: req.params.id, isActive: true });

    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }

    const foods = await Food.find({ restaurant: restaurant._id, isAvailable: true })
      .select('name description price image category restaurant isVeg')
      .sort({ category: 1, price: 1 });

    return res.status(200).json({
      success: true,
      data: { ...restaurant.toObject(), foods },
    });
  } catch (error) {
    return next(error);
  }
};

const getRestaurantMenu = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findOne({ _id: req.params.id, isActive: true }).select(
      'name description image cuisine rating deliveryTime deliveryFee minOrder address isOpen'
    );

    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }

    const foods = await Food.find({ restaurant: restaurant._id, isAvailable: true }).sort({
      category: 1,
      price: 1,
    });

    return res.status(200).json({
      success: true,
      count: foods.length,
      data: { restaurant, foods },
    });
  } catch (error) {
    return next(error);
  }
};

const createRestaurant = async (req, res, next) => {
  try {
    const { name, description, image, cuisine, rating, deliveryTime, deliveryFee, minOrder, address, isOpen } =
      req.body;

    if (cuisine !== undefined && (!Array.isArray(cuisine) || cuisine.length === 0)) {
      throw new ApiError(400, 'cuisine must be a non-empty array, for example ["Chinese", "Snacks"]');
    }

    const restaurant = await Restaurant.create({
      name,
      description,
      image,
      cuisine,
      rating,
      deliveryTime,
      deliveryFee,
      minOrder,
      address,
      isOpen,
    });

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
    const allowedFields = [
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
      'isActive',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No updatable fields provided');
    }

    if (updates.cuisine !== undefined && (!Array.isArray(updates.cuisine) || updates.cuisine.length === 0)) {
      throw new ApiError(400, 'cuisine must be a non-empty array');
    }

    const restaurant = await Restaurant.findOneAndUpdate(
      { _id: req.params.id },
      updates,
      { new: true, runValidators: true }
    );

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

const deleteRestaurant = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findOneAndUpdate(
      { _id: req.params.id, isActive: true },
      { isActive: false, isOpen: false },
      { new: true }
    );

    if (!restaurant) {
      throw new ApiError(404, 'Restaurant not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Restaurant removed',
      data: { id: restaurant._id, isActive: restaurant.isActive },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllRestaurants,
  getRestaurantById,
  getRestaurantMenu,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
};
