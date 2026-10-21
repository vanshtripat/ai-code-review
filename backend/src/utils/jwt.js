const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token for a given user ID.
 * @param {string} userId - User's MongoDB _id string
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  return jwt.sign({ userId }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

/**
 * Verify a JWT token.
 * @param {string} token - JWT token string
 * @returns {object} Decoded payload
 */
const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  return jwt.verify(token, secret);
};

module.exports = {
  generateToken,
  verifyToken
};
