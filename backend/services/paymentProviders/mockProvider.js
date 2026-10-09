const crypto = require('crypto');
const { PAYMENT_CURRENCY } = require('../../utils/constants');

const generateTransactionId = () =>
  `MOCK_TXN_${Date.now()}_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

const processMockPayment = async ({ paymentMethod, testResult }) => {
  if (paymentMethod === 'COD') {
    return {
      transactionId: null,
      status: 'PENDING',
      currency: PAYMENT_CURRENCY,
    };
  }

  const status = testResult === 'FAILED' ? 'FAILED' : 'SUCCESS';

  return {
    transactionId: generateTransactionId(),
    status,
    currency: PAYMENT_CURRENCY,
  };
};

module.exports = { processMockPayment, generateTransactionId };
