const express = require('express');
const {
  getAddresses,
  createAddress,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require('../controllers/addressController');
const { protect } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

router.use(protect);

router.get('/', getAddresses);
router.post('/', createAddress);
router.get('/:addressId', validateObjectId('addressId'), getAddressById);
router.put('/:addressId', validateObjectId('addressId'), updateAddress);
router.delete('/:addressId', validateObjectId('addressId'), deleteAddress);
router.patch('/:addressId/default', validateObjectId('addressId'), setDefaultAddress);

module.exports = router;
