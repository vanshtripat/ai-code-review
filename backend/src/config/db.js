const mongoose = require('mongoose');
const dns = require('dns');

// Ensure DNS resolution succeeds for mongodb+srv URLs on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if unable to set custom DNS servers
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`MongoDB connected successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Atlas connection error: ${error.message}`);
    console.log('Attempting MongoMemoryServer fallback for local development/testing...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      const conn = await mongoose.connect(uri);
      console.log(`MongoMemoryServer fallback connected successfully: ${conn.connection.host}`);
    } catch (fallbackError) {
      console.error(`Fallback database connection failed: ${fallbackError.message}`);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
