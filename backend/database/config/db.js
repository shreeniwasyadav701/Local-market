const mongoose = require('mongoose');

/**
 * connectDB()
 * Establishes the connection between our Express server and MongoDB.
 * If the connection fails, we stop the entire application immediately (fail fast).
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected successfully: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
