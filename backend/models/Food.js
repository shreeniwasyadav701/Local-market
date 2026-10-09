const mongoose = require('mongoose');
const { FOOD_CATEGORIES } = require('../utils/constants');

const foodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Food name is required'],
      trim: true,
      maxlength: [80, 'Food name cannot exceed 80 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [400, 'Description cannot exceed 400 characters'],
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [1, 'Price must be at least 1'],
    },
    image: {
      type: String,
      required: [true, 'Food image is required'],
      default: '/assets/images/foods/default.svg',
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: FOOD_CATEGORIES,
        message: '{VALUE} is not a valid category',
      },
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant reference is required'],
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

foodSchema.index({ name: 'text', description: 'text' });
foodSchema.index({ restaurant: 1 });
foodSchema.index({ category: 1 });

module.exports = mongoose.model('Food', foodSchema);
