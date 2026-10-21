const authService = require('../services/authService');

/**
 * Controller to handle user registration HTTP requests.
 * Endpoint: POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    const user = await authService.registerUser({ name, email, password });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user
    });
  } catch (error) {
    // Handle MongoDB duplicate key error (code 11000)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    // Handle custom validation or business logic errors
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Server error occurred during registration';

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Controller to handle user login HTTP requests.
 * Endpoint: POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const result = await authService.loginUser({ email, password });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: result.token,
      user: result.user
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Server error occurred during login';

    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

module.exports = {
  register,
  login
};
