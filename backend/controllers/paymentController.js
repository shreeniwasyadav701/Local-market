const mongoose = require('mongoose');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const { ApiError } = require('../middleware/errorHandler');
const { PAYMENT_STATUSES } = require('../utils/constants');
const { parsePagination } = require('../utils/helpers');
const { createPayment } = require('../services/paymentService');

const buildStatusView = (payment) => ({
  paymentId: payment._id,
  orderId: payment.orderId,
  amount: payment.amount,
  currency: payment.currency,
  paymentMethod: payment.paymentMethod,
  paymentStatus: payment.paymentStatus,
  transactionId: payment.transactionId || null,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
});

const buildHistoryView = (payment) => ({
  paymentId: payment._id,
  orderId: payment.orderId,
  amount: payment.amount,
  paymentMethod: payment.paymentMethod,
  paymentStatus: payment.paymentStatus,
  transactionId: payment.transactionId || null,
  createdAt: payment.createdAt,
});

const createMockPayment = async (req, res, next) => {
  try {
    const { orderId, paymentMethod, testResult, amount } = req.body || {};

    const { payment, created } = await createPayment({
      orderId,
      paymentMethod,
      testResult,
      amount,
      user: req.user,
    });

    let message;
    if (!created) {
      message = 'COD payment is pending';
    } else if (payment.paymentStatus === 'SUCCESS') {
      message = 'Mock payment successful';
    } else if (payment.paymentStatus === 'FAILED') {
      message = 'Mock payment failed';
    } else {
      message = 'COD payment is pending';
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      message,
      payment: {
        paymentId: payment._id,
        orderId: payment.orderId,
        transactionId: payment.transactionId || null,
        status: payment.paymentStatus,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getPaymentForOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    const isOwner = order.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      throw new ApiError(404, 'Order not found');
    }

    const payment = await Payment.findOne({ orderId: order._id }).sort({
      createdAt: -1,
      _id: -1,
    });
    if (!payment) {
      throw new ApiError(404, 'Payment not found');
    }

    return res.status(200).json({ success: true, data: buildStatusView(payment) });
  } catch (error) {
    return next(error);
  }
};

const listMyPayments = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [payments, totalItems] = await Promise.all([
      Payment.find({ userId: req.user._id })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments({ userId: req.user._id }),
    ]);

    return res.status(200).json({
      success: true,
      count: payments.length,
      data: payments.map(buildHistoryView),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminPayments = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.status !== undefined) {
      const normalized = String(req.query.status).trim().toUpperCase();
      if (!PAYMENT_STATUSES.includes(normalized)) {
        throw new ApiError(
          400,
          `Invalid status value: ${req.query.status}. Allowed values: ${PAYMENT_STATUSES.join(', ')}`
        );
      }
      filter.paymentStatus = normalized;
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [payments, totalPayments] = await Promise.all([
      Payment.find(filter)
        .populate('userId', 'name')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments: payments.map((payment) => ({
        ...buildHistoryView(payment),
        currency: payment.currency,
        customer: payment.userId,
      })),
      pagination: {
        page,
        limit,
        totalPayments,
        totalPages: Math.ceil(totalPayments / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const refundPayment = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw new ApiError(404, 'Payment not found');
    }

    if (payment.paymentStatus === 'REFUNDED') {
      throw new ApiError(409, 'Payment has already been refunded');
    }

    if (payment.paymentStatus !== 'SUCCESS') {
      throw new ApiError(
        400,
        `Only successful payments can be refunded (current status: ${payment.paymentStatus})`
      );
    }

    payment.paymentStatus = 'REFUNDED';
    await payment.save();

    return res.status(200).json({
      success: true,
      message: 'Payment refunded',
      payment: {
        paymentId: payment._id,
        orderId: payment.orderId,
        transactionId: payment.transactionId || null,
        status: payment.paymentStatus,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createMockPayment,
  getPaymentForOrder,
  listMyPayments,
  getAdminPayments,
  refundPayment,
};
