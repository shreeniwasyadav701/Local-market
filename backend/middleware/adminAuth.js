const { ApiError } = require('./errorHandler');

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(new ApiError(403, 'Admin access required'));
  }
  return next();
};

module.exports = { requireAdmin };
