const mongoose = require('mongoose');
const { ApiError } = require('./errorHandler');

const validateObjectId = (paramName = 'id') => (req, res, next) => {
  const value = req.params[paramName];

  if (!mongoose.isValidObjectId(value)) {
    return next(new ApiError(400, `Invalid ${paramName}: ${value}`));
  }

  return next();
};

module.exports = validateObjectId;
