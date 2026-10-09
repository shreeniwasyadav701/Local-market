const mongoose = require('mongoose');
const { ORDER_STATUSES } = require('../utils/constants');
const { calculateDeliveryCharge, round } = require('../services/deliveryService');

const orderItemSchema = new mongoose.Schema({
  food: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Food',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  image: {
    type: String,
    default: '',
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  itemSubtotal: {
    type: Number,
    min: 0,
  },
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator(items) {
          return items.length > 0;
        },
        message: 'Order must contain at least one item',
      },
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^[0-9]{10}$/, 'Phone number must be 10 digits'],
    },
    address: {
      type: String,
      required: [true, 'Delivery address is required'],
      trim: true,
      maxlength: [300, 'Address cannot exceed 300 characters'],
    },
    deliveryAddress: {
      fullName: String,
      phone: String,
      houseNumber: String,
      street: String,
      area: String,
      city: String,
      state: String,
      pincode: String,
      landmark: String,
      addressType: String,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryCharge: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['cod', 'upi'],
        message: 'Payment method must be cod or upi',
      },
      default: 'cod',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },
    status: {
      type: String,
      enum: {
        values: ORDER_STATUSES,
        message: '{VALUE} is not a valid order status',
      },
      default: 'placed',
    },
    statusHistory: [
      {
        status: String,
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

orderSchema.pre('validate', function () {
  this.subtotal = round(this.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  this.deliveryCharge = calculateDeliveryCharge(this.subtotal).deliveryCharge;
  this.total = round(this.subtotal + this.deliveryCharge);

  if (this.isNew) {
    this.items.forEach((item) => {
      item.itemSubtotal = round(item.price * item.quantity);
    });
    this.statusHistory = [{ status: this.status }];
  }
});

module.exports = mongoose.model('Order', orderSchema);
