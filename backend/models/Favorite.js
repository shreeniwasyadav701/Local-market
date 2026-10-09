const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    food: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Food',
      required: [true, 'Food reference is required'],
    },
  },
  {
    timestamps: true,
  }
);

favoriteSchema.index({ user: 1, food: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);
