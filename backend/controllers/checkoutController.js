const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Food = require('../models/Food');
const Restaurant = require('../models/Restaurant');
const Address = require('../models/Address');
const { ApiError } = require('../middleware/errorHandler');
const { calculateDeliveryCharge, round } = require('../services/deliveryService');

const getCheckout = async (req, res, next) => {
  try {
    const { addressId } = req.query;

    if (addressId !== undefined && !mongoose.isValidObjectId(addressId)) {
      throw new ApiError(400, `Invalid address id: ${addressId}`);
    }

    const addresses = await Address.find({ user: req.user._id }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    let selectedAddress = null;
    if (addressId !== undefined) {
      selectedAddress = addresses.find((entry) => entry._id.toString() === addressId) || null;
      if (!selectedAddress) {
        throw new ApiError(404, 'Address not found');
      }
    } else {
      selectedAddress = addresses.find((entry) => entry.isDefault) || null;
    }

    const cart = await Cart.findOne({ user: req.user._id });
    const cartItems = cart ? cart.items : [];

    const foodIds = cartItems.map((item) => item.food);
    const foods = foodIds.length > 0 ? await Food.find({ _id: { $in: foodIds } }) : [];
    const foodMap = new Map(foods.map((food) => [food._id.toString(), food]));

    const restaurantIds = [...new Set(foods.map((food) => food.restaurant.toString()))];
    const restaurants =
      restaurantIds.length > 0
        ? await Restaurant.find({ _id: { $in: restaurantIds } }).select('name isActive')
        : [];
    const restaurantMap = new Map(restaurants.map((rest) => [rest._id.toString(), rest]));

    const issues = [];
    let subtotal = 0;
    let itemCount = 0;

    const items = cartItems.map((item) => {
      const live = foodMap.get(item.food.toString());

      if (!live) {
        issues.push(`${item.name} is no longer available`);
        return {
          food: item.food,
          name: item.name,
          image: item.image,
          quantity: item.quantity,
          price: 0,
          itemTotal: 0,
          isAvailable: false,
          restaurant: null,
        };
      }

      const restaurant = live.restaurant
        ? restaurantMap.get(live.restaurant.toString())
        : null;

      if (!live.isAvailable) {
        issues.push(`${live.name} is unavailable`);
      }
      if (!restaurant) {
        issues.push(`${live.name} restaurant information is unavailable`);
      } else if (!restaurant.isActive) {
        issues.push(`${restaurant.name} is not accepting orders right now`);
      }

      const itemTotal = round(live.price * item.quantity);
      subtotal += itemTotal;
      itemCount += live.isAvailable ? item.quantity : 0;

      return {
        food: live._id,
        name: live.name,
        image: live.image,
        quantity: item.quantity,
        price: live.price,
        itemTotal,
        isAvailable: live.isAvailable,
        restaurant: restaurant
          ? { _id: restaurant._id, name: restaurant.name, isActive: restaurant.isActive }
          : null,
      };
    });

    subtotal = round(subtotal);
    const { deliveryCharge, freeDeliveryThreshold, total } = calculateDeliveryCharge(subtotal);

    return res.status(200).json({
      success: true,
      data: {
        items,
        itemCount,
        subtotal,
        deliveryCharge,
        freeDeliveryThreshold,
        total,
        addresses,
        selectedAddress,
        issues,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getCheckout };
