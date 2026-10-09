const Address = require('../models/Address');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/helpers');

const ADDRESS_TYPES = ['HOME', 'WORK', 'OTHER'];

const STRING_FIELDS = [
  'fullName',
  'phone',
  'houseNumber',
  'street',
  'area',
  'city',
  'state',
  'pincode',
  'landmark',
];

const UPDATABLE_FIELDS = [...STRING_FIELDS, 'addressType', 'isDefault'];

const validateAddressFields = (body, { requireAll = true } = {}) => {
  const errors = [];
  const has = (field) => body[field] !== undefined;

  const checkRequired = (field, label) => {
    if (requireAll || has(field)) {
      if (!body[field] || !String(body[field]).trim()) {
        errors.push(`${label} is required`);
      }
    }
  };

  checkRequired('fullName', 'fullName');
  checkRequired('houseNumber', 'houseNumber');
  checkRequired('street', 'street');
  checkRequired('area', 'area');
  checkRequired('city', 'city');
  checkRequired('state', 'state');

  if (requireAll || has('phone')) {
    if (!body.phone || !/^[0-9]{10}$/.test(String(body.phone).trim())) {
      errors.push('Phone must be exactly 10 digits');
    }
  }

  if (requireAll || has('pincode')) {
    if (!body.pincode || !/^[1-9][0-9]{5}$/.test(String(body.pincode).trim())) {
      errors.push('pincode must be a valid 6 digit Indian pincode');
    }
  }

  if (has('addressType')) {
    if (!ADDRESS_TYPES.includes(body.addressType)) {
      errors.push('addressType must be one of: HOME, WORK, OTHER');
    }
  }

  if (has('isDefault') && typeof body.isDefault !== 'boolean') {
    errors.push('isDefault must be a boolean');
  }

  return errors;
};

const pickFields = (body) => {
  const data = {};
  for (const field of UPDATABLE_FIELDS) {
    if (body[field] === undefined) continue;
    data[field] = STRING_FIELDS.includes(field) ? String(body[field]).trim() : body[field];
  }
  return data;
};

const unsetOtherDefaults = async (userId, excludeId) => {
  const filter = { user: userId };
  if (excludeId) filter._id = { $ne: excludeId };
  await Address.updateMany(filter, { isDefault: false });
};

const createAddress = async (req, res, next) => {
  try {
    const body = req.body || {};
    const errors = validateAddressFields(body);

    if (errors.length > 0) throw new ApiError(400, errors.join(', '));

    const data = pickFields(body);

    if (data.isDefault === true) {
      await unsetOtherDefaults(req.user._id);
    }

    const address = await Address.create({ ...data, user: req.user._id });

    return res.status(201).json({
      success: true,
      message: 'Address added',
      data: address,
    });
  } catch (error) {
    return next(error);
  }
};

const getAddresses = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [addresses, totalItems] = await Promise.all([
      Address.find({ user: req.user._id })
        .sort({ isDefault: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Address.countDocuments({ user: req.user._id }),
    ]);

    return res.status(200).json({
      success: true,
      count: addresses.length,
      data: addresses,
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

const getAddressById = async (req, res, next) => {
  try {
    const address = await Address.findOne({ _id: req.params.addressId, user: req.user._id });

    if (!address) {
      throw new ApiError(404, 'Address not found');
    }

    return res.status(200).json({ success: true, data: address });
  } catch (error) {
    return next(error);
  }
};

const updateAddress = async (req, res, next) => {
  try {
    const body = req.body || {};
    const errors = validateAddressFields(body, { requireAll: false });
    const updates = pickFields(body);

    if (errors.length > 0) throw new ApiError(400, errors.join(', '));
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No updatable fields provided');
    }

    const existing = await Address.findOne({ _id: req.params.addressId, user: req.user._id });
    if (!existing) {
      throw new ApiError(404, 'Address not found');
    }

    if (updates.isDefault === true) {
      await unsetOtherDefaults(req.user._id, existing._id);
    }

    const address = await Address.findOneAndUpdate({ _id: existing._id, user: req.user._id }, updates, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: 'Address updated',
      data: address,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteAddress = async (req, res, next) => {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.addressId, user: req.user._id });

    if (!address) {
      throw new ApiError(404, 'Address not found');
    }

    let defaultReassigned = false;
    if (address.isDefault) {
      const nextDefault = await Address.findOne({ user: req.user._id }).sort({ createdAt: 1 });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
        defaultReassigned = true;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Address deleted',
      data: { id: address._id, defaultReassigned },
    });
  } catch (error) {
    return next(error);
  }
};

const setDefaultAddress = async (req, res, next) => {
  try {
    const existing = await Address.findOne({ _id: req.params.addressId, user: req.user._id });
    if (!existing) {
      throw new ApiError(404, 'Address not found');
    }

    await unsetOtherDefaults(req.user._id, existing._id);

    const address = await Address.findOneAndUpdate(
      { _id: existing._id, user: req.user._id },
      { isDefault: true },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Default address updated',
      data: address,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};
