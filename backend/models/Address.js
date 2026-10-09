const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [60, 'Full name cannot exceed 60 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^[0-9]{10}$/, 'Phone number must be 10 digits'],
    },
    houseNumber: {
      type: String,
      required: [true, 'House/flat number is required'],
      trim: true,
      maxlength: [50, 'House number cannot exceed 50 characters'],
    },
    street: {
      type: String,
      required: [true, 'Street is required'],
      trim: true,
      maxlength: [100, 'Street cannot exceed 100 characters'],
    },
    area: {
      type: String,
      required: [true, 'Area is required'],
      trim: true,
      maxlength: [100, 'Area cannot exceed 100 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [60, 'City cannot exceed 60 characters'],
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      maxlength: [60, 'State cannot exceed 60 characters'],
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      match: [/^[1-9][0-9]{5}$/, 'Pincode must be a valid 6 digit Indian pincode'],
    },
    landmark: {
      type: String,
      trim: true,
      maxlength: [120, 'Landmark cannot exceed 120 characters'],
      default: '',
    },
    addressType: {
      type: String,
      enum: {
        values: ['HOME', 'WORK', 'OTHER'],
        message: 'addressType must be one of: HOME, WORK, OTHER',
      },
      default: 'HOME',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.user;
        return ret;
      },
    },
  }
);

addressSchema.index({ user: 1, createdAt: -1 });
addressSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

module.exports = mongoose.model('Address', addressSchema);
