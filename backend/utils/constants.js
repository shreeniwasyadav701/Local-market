const FOOD_CATEGORIES = [
  'Starters',
  'Main Course',
  'Breads',
  'Rice',
  'Biryani',
  'Desserts',
  'Beverages',
  'Snacks',
  'Pizza',
];

const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

const DELIVERY_CHARGE = 30;

const FREE_DELIVERY_ABOVE = 499;

const PAYMENT_METHODS = ['COD', 'MOCK_CARD', 'MOCK_UPI'];

const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];

const MOCK_TEST_RESULTS = ['SUCCESS', 'FAILED'];

const PAYMENT_CURRENCY = 'INR';

const FOOD_SORTS = {
  price_asc: { price: 1, name: 1 },
  price_desc: { price: -1, name: 1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
};

const RESTAURANT_SORTS = {
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  rating_asc: { rating: 1, name: 1 },
  rating_desc: { rating: -1, name: 1 },
};

module.exports = {
  FOOD_CATEGORIES,
  ORDER_STATUSES,
  DELIVERY_CHARGE,
  FREE_DELIVERY_ABOVE,
  FOOD_SORTS,
  RESTAURANT_SORTS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  MOCK_TEST_RESULTS,
  PAYMENT_CURRENCY,
};
