const Order = require('../models/Order');
const { ApiError } = require('../middleware/errorHandler');
const { ORDER_STATUSES } = require('../utils/constants');
const { parsePagination } = require('../utils/helpers');

const getAdminOrders = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.status !== undefined) {
      const normalized = String(req.query.status).trim().toLowerCase();
      if (!ORDER_STATUSES.includes(normalized)) {
        throw new ApiError(
          400,
          `Invalid status value: ${req.query.status}. Allowed values: ${ORDER_STATUSES.join(', ')}`
        );
      }
      filter.status = normalized;
    }

    const { page, limit, skip } = parsePagination(req.query);

    const [orders, totalOrders] = await Promise.all([
      Order.find(filter)
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
      pagination: {
        page,
        limit,
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminOrderById = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId }).populate(
      'user',
      'name email phone'
    );

    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAdminOrders, getAdminOrderById };
