const { DELIVERY_CHARGE, FREE_DELIVERY_ABOVE } = require('../utils/constants');

const round = (value) => Math.round(value * 100) / 100;

const calculateDeliveryCharge = (subtotal) => {
  const deliveryCharge =
    subtotal === 0 || subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_CHARGE;

  return {
    deliveryCharge,
    freeDeliveryThreshold: FREE_DELIVERY_ABOVE,
    total: round(subtotal + deliveryCharge),
  };
};

module.exports = { calculateDeliveryCharge, round };
