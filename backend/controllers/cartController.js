const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Food = require('../models/Food');
const Restaurant = require('../models/Restaurant');
const { ApiError } = require('../middleware/errorHandler');
const { calculateDeliveryCharge, round } = require('../services/deliveryService');

const buildSummary = (cart) => {
  const items = cart ? cart.items : [];
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = round(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const { deliveryCharge, freeDeliveryThreshold, total } = calculateDeliveryCharge(subtotal);

  return {
    items,
    itemCount,
    subtotal,
    deliveryCharge,
    freeDeliveryThreshold,
    total,
  };
};

const getCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    return res.status(200).json({ success: true, data: buildSummary(cart) });
  } catch (error) {
    return next(error);
  }
};

const addToCart = async (req, res, next) => {
  try {
    const { foodId, quantity } = req.body || {};
    const qty = quantity === undefined ? 1 : Number(quantity);

    if (!foodId) {
      throw new ApiError(400, 'foodId is required');
    }
    if (!mongoose.isValidObjectId(foodId)) {
      throw new ApiError(400, `Invalid food id: ${foodId}`);
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw new ApiError(400, 'Quantity must be a whole number between 1 and 50');
    }

    const food = await Food.findOne({ _id: foodId, isAvailable: true });
    if (!food) {
      throw new ApiError(404, 'Food item not found or unavailable');
    }

    const restaurant = await Restaurant.findById(food.restaurant).select('isActive');
    if (!restaurant || !restaurant.isActive) {
      throw new ApiError(400, 'This restaurant is currently not accepting orders');
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    const existing = cart.items.find((item) => item.food.toString() === foodId);

    if (existing) {
      const newQuantity = existing.quantity + qty;
      if (newQuantity > 50) {
        throw new ApiError(400, 'Maximum quantity per item is 50');
      }
      existing.quantity = newQuantity;
      existing.name = food.name;
      existing.price = food.price;
      existing.image = food.image;
      await cart.save();
      return res.status(200).json({
        success: true,
        message: 'Cart quantity updated',
        data: buildSummary(cart),
      });
    }

    cart.items.push({
      food: food._id,
      name: food.name,
      price: food.price,
      image: food.image,
      quantity: qty,
    });
    await cart.save();
    return res.status(201).json({
      success: true,
      message: 'Added to cart',
      data: buildSummary(cart),
    });
  } catch (error) {
    return next(error);
  }
};

const updateQuantity = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body || {};

    if (!mongoose.isValidObjectId(itemId)) {
      throw new ApiError(400, `Invalid cart item id: ${itemId}`);
    }
    if (quantity === undefined) {
      throw new ApiError(400, 'quantity is required');
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw new ApiError(400, 'Quantity must be a whole number between 1 and 50');
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      throw new ApiError(404, 'Cart not found');
    }

    const item = cart.items.find((entry) => entry._id.toString() === itemId);
    if (!item) {
      throw new ApiError(404, 'Item not found in your cart');
    }

    item.quantity = qty;
    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Quantity updated',
      data: buildSummary(cart),
    });
  } catch (error) {
    return next(error);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    if (!mongoose.isValidObjectId(itemId)) {
      throw new ApiError(400, `Invalid cart item id: ${itemId}`);
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      throw new ApiError(404, 'Cart not found');
    }

    const index = cart.items.findIndex((entry) => entry._id.toString() === itemId);
    if (index === -1) {
      throw new ApiError(404, 'Item not found in your cart');
    }

    cart.items.splice(index, 1);
    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: buildSummary(cart),
    });
  } catch (error) {
    return next(error);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart && cart.items.length > 0) {
      cart.items = [];
      await cart.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Cart cleared',
      data: buildSummary(cart),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getCart, addToCart, updateQuantity, removeItem, clearCart };
