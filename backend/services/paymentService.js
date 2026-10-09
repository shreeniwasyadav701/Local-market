const mongoose = require('mongoose');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const { ApiError } = require('../middleware/errorHandler');
const { PAYMENT_METHODS, MOCK_TEST_RESULTS, PAYMENT_CURRENCY } = require('../utils/constants');
const { processMockPayment } = require('./paymentProviders/mockProvider');

const normalizeEnum = (value, allowed) => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : null;
};

const loadOwnedOrder = async (orderId, user) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new ApiError(400, `Invalid order id: ${orderId}`);
  }

  const order = await Order.findOne({ _id: orderId, user: user._id });
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  return order;
};

const createPayment = async ({ orderId, paymentMethod, testResult, amount, user }) => {
  if (orderId === undefined || orderId === null || orderId === '') {
    throw new ApiError(400, 'orderId is required');
  }
  if (paymentMethod === undefined || paymentMethod === null || paymentMethod === '') {
    throw new ApiError(400, 'paymentMethod is required');
  }

  const method = normalizeEnum(paymentMethod, PAYMENT_METHODS);
  if (!method) {
    throw new ApiError(
      400,
      `Invalid payment method: ${paymentMethod}. Allowed values: ${PAYMENT_METHODS.join(', ')}`
    );
  }

  let requestedResult = null;
  if (testResult !== undefined && testResult !== null && testResult !== '') {
    requestedResult = normalizeEnum(testResult, MOCK_TEST_RESULTS);
    if (!requestedResult) {
      throw new ApiError(
        400,
        `Invalid test result: ${testResult}. Allowed values: ${MOCK_TEST_RESULTS.join(', ')}`
      );
    }
  }

  const order = await loadOwnedOrder(orderId, user);

  if (!order.total || order.total <= 0) {
    throw new ApiError(400, 'Order does not have a valid total amount');
  }

  if (amount !== undefined && amount !== null && amount !== '') {
    const clientAmount = Number(amount);
    if (Number.isNaN(clientAmount) || clientAmount !== order.total) {
      throw new ApiError(400, 'Amount does not match order total');
    }
  }

  const existingSuccess = await Payment.findOne({
    orderId: order._id,
    paymentStatus: 'SUCCESS',
  });
  if (existingSuccess) {
    throw new ApiError(409, 'Order has already been paid');
  }

  if (method === 'COD') {
    const existingPending = await Payment.findOne({
      orderId: order._id,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
    });
    if (existingPending) {
      return { payment: existingPending, created: false };
    }
  }

  const providerResult = await processMockPayment({
    paymentMethod: method,
    testResult: requestedResult || 'SUCCESS',
  });

  let payment;
  try {
    payment = await Payment.create({
      orderId: order._id,
      userId: user._id,
      amount: order.total,
      currency: PAYMENT_CURRENCY,
      paymentMethod: method,
      paymentStatus: providerResult.status,
      transactionId: providerResult.transactionId || undefined,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.orderId) {
      throw new ApiError(409, 'Order has already been paid');
    }
    throw error;
  }

  if (providerResult.status === 'SUCCESS') {
    await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'paid' } });
  }

  return { payment, created: true };
};

module.exports = { createPayment, loadOwnedOrder, normalizeEnum };
