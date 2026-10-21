const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');

/**
 * Register a new user in the system.
 * 
 * Flow:
 * 1. Validate inputs (name, email, password)
 * 2. Check if user with given email already exists
 * 3. Hash password using bcryptjs
 * 4. Create and save user in MongoDB
 * 5. Return sanitized user data (without password hash)
 */
const registerUser = async ({ name, email, password }) => {
  // 1. Validation
  if (!name || typeof name !== 'string' || !name.trim()) {
    const error = new Error('Name is required');
    error.statusCode = 400;
    throw error;
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    const error = new Error('Name must be at least 2 characters long');
    error.statusCode = 400;
    throw error;
  }

  if (trimmedName.length > 50) {
    const error = new Error('Name cannot exceed 50 characters');
    error.statusCode = 400;
    throw error;
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    const error = new Error('Email is required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/;
  if (!emailRegex.test(normalizedEmail)) {
    const error = new Error('Please provide a valid email address');
    error.statusCode = 400;
    throw error;
  }

  if (!password || typeof password !== 'string') {
    const error = new Error('Password is required');
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error('Password must be at least 6 characters long');
    error.statusCode = 400;
    throw error;
  }

  // 2. Check for duplicate email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error('An account with this email already exists.');
    error.statusCode = 400;
    throw error;
  }

  // 3. Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // 4. Create user in MongoDB
  const newUser = await User.create({
    name: trimmedName,
    email: normalizedEmail,
    password: hashedPassword
  });

  // 5. Return sanitized user data
  return {
    id: newUser._id.toString(),
    name: newUser.name,
    email: newUser.email,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt
  };
};

/**
 * Authenticate a user with email and password.
 * 
 * Flow:
 * 1. Validate input (email, password)
 * 2. Find user by normalized email
 * 3. Compare password with stored bcrypt hash
 * 4. Generate JWT token
 * 5. Return token + safe user data
 */
const loginUser = async ({ email, password }) => {
  // 1. Validation
  if (!email || typeof email !== 'string' || !email.trim()) {
    const error = new Error('Email is required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/;
  if (!emailRegex.test(normalizedEmail)) {
    const error = new Error('Please provide a valid email address');
    error.statusCode = 400;
    throw error;
  }

  if (!password || typeof password !== 'string') {
    const error = new Error('Password is required');
    error.statusCode = 400;
    throw error;
  }

  // 2. Find User
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  // 3. Compare Password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  // 4. Generate JWT
  const token = generateToken(user._id.toString());

  // 5. Return sanitized response
  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email
    }
  };
};

module.exports = {
  registerUser,
  loginUser
};
