const mongoose = require('mongoose');
const { PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_CURRENCY } = require('../utils/constants');

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: PAYMENT_CURRENCY,
      uppercase: true,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: {
        values: PAYMENT_METHODS,
        message: 'paymentMethod must be one of: COD, MOCK_CARD, MOCK_UPI',
      },
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: {
        values: PAYMENT_STATUSES,
        message: 'paymentStatus must be one of: PENDING, SUCCESS, FAILED, REFUNDED',
      },
      default: 'PENDING',
    },
    transactionId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

paymentSchema.index({ orderId: 1, createdAt: -1 });
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ paymentStatus: 1 });
paymentSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { paymentStatus: 'SUCCESS' } }
);
paymentSchema.index({ transactionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
