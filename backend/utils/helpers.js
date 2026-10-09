const escapeRegex = (text = '') => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePagination = (query = {}, options = {}) => {
  const defaultLimit = options.defaultLimit || 10;
  const maxLimit = options.maxLimit || 50;

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const requested = parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(requested, 1), maxLimit);

  return { page, limit, skip: (page - 1) * limit };
};

const parseSort = (query = {}, allowed = {}) => {
  const raw = query.sort;

  if (raw === undefined || raw === '') {
    return { valid: true, sort: null };
  }

  if (typeof raw !== 'string' || !Object.prototype.hasOwnProperty.call(allowed, raw)) {
    return { valid: false, sort: null };
  }

  return { valid: true, sort: allowed[raw] };
};

module.exports = { escapeRegex, parsePagination, parseSort };
