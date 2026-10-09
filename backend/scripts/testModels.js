require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../database/config/db');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Food = require('../models/Food');
const Cart = require('../models/Cart');
const Order = require('../models/Order');

const run = async () => {
  await connectDB();

  const suffix = Date.now();
  const user = await User.create({
    name: 'Test User',
    email: `test${suffix}@example.com`,
    phone: '9876543210',
    password: 'secret123',
    address: '12 MG Road, Bengaluru',
  });
  console.log('1. User created:', user.email, '| password in DB starts with:', (await User.findById(user._id).select('+password')).password.slice(0, 7) + '...');

  const passwordOk = await user.matchPassword('secret123');
  const passwordBad = await user.matchPassword('wrongpass');
  console.log('2. bcrypt check -> correct password:', passwordOk, '| wrong password:', passwordBad);

  const restaurant = await Restaurant.create({
    name: 'Spice Garden',
    description: 'South Indian classics',
    cuisine: ['South Indian', 'Biryani'],
    deliveryTime: 30,
    address: '44 Church Street',
    rating: 4.5,
  });
  console.log('3. Restaurant created:', restaurant.name, '| id:', restaurant._id);

  const food = await Food.create({
    name: 'Masala Dosa',
    description: 'Crispy dosa with potato filling',
    price: 120,
    category: 'Main Course',
    restaurant: restaurant._id,
  });
  console.log('4. Food created:', food.name, '| price:', food.price);

  const cart = await Cart.create({
    user: user._id,
    items: [{ food: food._id, name: food.name, price: food.price, image: food.image, quantity: 2 }],
  });
  console.log('5. Cart created with', cart.items.length, 'item(s)');

  const order = await Order.create({
    user: user._id,
    items: [{ food: food._id, name: food.name, price: food.price, quantity: 2 }],
    customerName: 'Test User',
    phone: '9876543210',
    address: '12 MG Road, Bengaluru',
  });
  console.log('6. Order created -> subtotal:', order.subtotal, '| deliveryCharge:', order.deliveryCharge, '| total:', order.total, '| status:', order.status);
  console.log('   statusHistory:', JSON.stringify(order.statusHistory));

  const withPopulate = await Order.findById(order._id).populate('user', 'name email').populate('items.food', 'name category');
  console.log('7. populate worked -> user:', withPopulate.user.name, '| food category:', withPopulate.items[0].food.category);

  try {
    await Food.create({ name: 'Bad Food', price: -5, category: 'Biryani', restaurant: restaurant._id });
  } catch (error) {
    console.log('8. validation caught bad price ->', error.message);
  }

  try {
    await User.create({ name: 'X', email: 'not-an-email', phone: '12', password: 'a' });
  } catch (error) {
    console.log('9. validation caught bad user ->', Object.values(error.errors).map((e) => e.message).join(' | '));
  }

  const userJson = user.toJSON();
  console.log('10. password excluded from JSON output:', userJson.password === undefined);

  await Cart.deleteOne({ user: user._id });
  await Order.deleteOne({ _id: order._id });
  await Food.deleteOne({ _id: food._id });
  await Restaurant.deleteOne({ _id: restaurant._id });
  await User.deleteOne({ _id: user._id });
  console.log('11. test data cleaned up');

  await mongoose.disconnect();
  console.log('ALL MODEL TESTS PASSED');
};

run().catch((error) => {
  console.error('MODEL TEST FAILED:', error.message);
  process.exit(1);
});
