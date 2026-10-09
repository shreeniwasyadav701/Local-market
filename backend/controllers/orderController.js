const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Food = require('../models/Food');
const Restaurant = require('../models/Restaurant');
const Address = require('../models/Address');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/helpers');
const { ORDER_STATUSES } = require('../utils/constants');

const CANCELABLE_STATUSES = ['placed', 'confirmed'];
const PAYMENT_METHODS = ['cod', 'upi'];

const STATUS_TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

const validateDeliveryInfo = (body) => {
  const { customerName, phone, address, paymentMethod } = body;
  const errors = [];

  if (!customerName || !customerName.trim()) errors.push('Customer name is required');
  if (!phone || !/^[0-9]{10}$/.test(phone)) errors.push('Phone must be exactly 10 digits');
  if (!address || !address.trim()) errors.push('Delivery address is required');
  if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
    errors.push('Payment method must be cod or upi');
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors.join(', '));
  }

  return {
    customerName: customerName.trim(),
    phone,
    address: address.trim(),
    paymentMethod: paymentMethod || 'cod',
  };
};

const loadAddressForCheckout = async (addressId, userId) => {
  if (!mongoose.isValidObjectId(addressId)) {
    throw new ApiError(400, `Invalid address id: ${addressId}`);
  }

  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new ApiError(404, 'Address not found');
  }

  const required = ['fullName', 'phone', 'houseNumber', 'street', 'area', 'city', 'state', 'pincode'];
  const missing = required.filter((field) => !address[field] || !String(address[field]).trim());
  if (missing.length > 0) {
    throw new ApiError(400, `Address is incomplete: missing ${missing.join(', ')}`);
  }

  if (address.phone && !/^[0-9]{10}$/.test(address.phone)) {
    throw new ApiError(400, 'Address phone must be exactly 10 digits');
  }

  return address;
};

const formatAddressLine = (address) => {
  const line = [
    address.houseNumber,
    address.street,
    address.area,
    address.city,
    `${address.state} - ${address.pincode}`,
  ]
    .filter(Boolean)
    .join(', ');

  return address.landmark ? `${line}, ${address.landmark}` : line;
};

const buildOrderItems = async (userId) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, 'Your cart is empty');
  }

  const foodIds = cart.items.map((item) => item.food);
  const foods = await Food.find({ _id: { $in: foodIds }, isAvailable: true });

  if (foods.length !== foodIds.length) {
    const availableIds = new Set(foods.map((food) => food._id.toString()));
    const missing = cart.items
      .filter((item) => !availableIds.has(item.food.toString()))
      .map((item) => item.name);
    throw new ApiError(400, `These items are no longer available: ${missing.join(', ')}`);
  }

  const restaurantIds = [...new Set(foods.map((food) => food.restaurant.toString()))];
  const activeRestaurants = await Restaurant.countDocuments({
    _id: { $in: restaurantIds },
    isActive: true,
  });
  if (activeRestaurants !== restaurantIds.length) {
    throw new ApiError(400, 'One of your restaurants is not accepting orders right now');
  }

  const foodMap = new Map(foods.map((food) => [food._id.toString(), food]));
  const orderItems = cart.items.map((item) => {
    const live = foodMap.get(item.food.toString());
    return {
      food: live._id,
      name: live.name,
      price: live.price,
      image: live.image,
      quantity: item.quantity,
    };
  });

  return { cart, orderItems };
};

const placeOrder = async (req, res, next) => {
  try {
    const body = req.body || {};
    const usesSavedAddress = body.addressId !== undefined;

    let delivery;
    let deliveryAddress;

    if (usesSavedAddress) {
      const address = await loadAddressForCheckout(body.addressId, req.user._id);

      if (body.paymentMethod !== undefined && !PAYMENT_METHODS.includes(body.paymentMethod)) {
        throw new ApiError(400, 'Payment method must be cod or upi');
      }

      delivery = {
        customerName: address.fullName.trim(),
        phone: address.phone,
        address: formatAddressLine(address),
        paymentMethod: body.paymentMethod || 'cod',
      };
      deliveryAddress = {
        fullName: address.fullName,
        phone: address.phone,
        houseNumber: address.houseNumber,
        street: address.street,
        area: address.area,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark,
        addressType: address.addressType,
      };
    } else {
      delivery = validateDeliveryInfo(body);
    }

    const { cart, orderItems } = await buildOrderItems(req.user._id);

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      ...delivery,
      ...(deliveryAddress ? { deliveryAddress } : {}),
    });

    try {
      await Cart.updateOne({ _id: cart._id }, { $set: { items: [] } });
    } catch (clearError) {
      console.error('Cart clear after order failed:', clearError.message);
    }

    const responseOrder = {
      orderId: order._id,
      status: order.status,
      items: order.items,
      address: order.address,
      subtotal: order.subtotal,
      deliveryCharge: order.deliveryCharge,
      total: order.total,
      createdAt: order.createdAt,
    };
    if (usesSavedAddress) {
      responseOrder.deliveryAddress = order.deliveryAddress;
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: order,
      order: responseOrder,
    });
  } catch (error) {
    return next(error);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [orders, total] = await Promise.all([
      Order.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments({ user: req.user._id }),
    ]);

    return res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) {
    return next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    if (order.status === 'cancelled') {
      return res.status(200).json({
        success: true,
        message: 'Order is already cancelled',
        data: order,
      });
    }

    if (!CANCELABLE_STATUSES.includes(order.status)) {
      throw new ApiError(
        400,
        `Order cannot be cancelled once status is ${order.status.replace('_', ' ')}`
      );
    }

    order.status = 'cancelled';
    order.statusHistory.push({ status: 'cancelled' });
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Order cancelled',
      data: order,
    });
  } catch (error) {
    return next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body || {};

    if (!status || typeof status !== 'string') {
      throw new ApiError(400, 'status is required, for example {"status": "CONFIRMED"}');
    }

    const target = status.trim().toLowerCase();
    if (!ORDER_STATUSES.includes(target)) {
      throw new ApiError(
        400,
        `Invalid status value: ${status}. Allowed values: ${ORDER_STATUSES.join(', ')}`
      );
    }

    const order = await Order.findOne({ _id: req.params.orderId });
    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    const allowed = STATUS_TRANSITIONS[order.status] || [];
    if (!allowed.includes(target)) {
      throw new ApiError(400, `Cannot change status from ${order.status} to ${target}`);
    }

    order.status = target;
    order.statusHistory.push({ status: target });
    await order.save();

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${target}`,
      data: order,
    });
  } catch (error) {
    return next(error);
  }
};

const trackOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });

    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    return res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        status: order.status,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          image: item.image,
        })),
        subtotal: order.subtotal,
        deliveryCharge: order.deliveryCharge,
        total: order.total,
        statusHistory: order.statusHistory,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { placeOrder, getMyOrders, getOrderById, cancelOrder, updateStatus, trackOrder };
