const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Restaurant name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    image: {
      type: String,
      required: [true, 'Restaurant image is required'],
      default: '/assets/images/restaurants/default.svg',
    },
    cuisine: {
      type: [String],
      required: true,
    },
    rating: {
      type: Number,
      min: [0, 'Rating cannot be below 0'],
      max: [5, 'Rating cannot be above 5'],
      default: 4,
    },
    deliveryTime: {
      type: Number,
      required: [true, 'Delivery time is required'],
      min: [5, 'Delivery time must be at least 5 minutes'],
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: [0, 'Delivery fee cannot be negative'],
      default: 30,
    },
    minOrder: {
      type: Number,
      min: [0, 'Minimum order cannot be negative'],
      default: 0,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters'],
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

restaurantSchema.index({ name: 'text', cuisine: 'text' });

module.exports = mongoose.model('Restaurant', restaurantSchema);
