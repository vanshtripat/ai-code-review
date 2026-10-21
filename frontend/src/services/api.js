const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Helper to handle fetch requests and standardize responses and errors.
 */
const request = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const errorMessage = data?.message || `Request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      const networkError = new Error('Unable to connect to the server. Please check your backend connection.');
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw error;
  }
};

/**
 * Register a new user
 * @param {Object} userData - { name, email, password }
 */
export const registerUser = async (userData) => {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
};

/**
 * Login user with credentials
 * @param {Object} credentials - { email, password }
 */
export const loginUser = async (credentials) => {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
};

/**
 * Submit code for review
 * @param {Object} reviewData - { language, sourceCode, focus }
 * @param {string} token - JWT auth token
 */
export const submitCodeReview = async (reviewData, token) => {
  return request('/reviews', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(reviewData)
  });
};

/**
 * Fetch all code reviews for the authenticated user
 * @param {string} token - JWT auth token
 */
export const getReviews = async (token) => {
  return request('/reviews', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

/**
 * Fetch a single review by its ID
 * @param {string} id - Review ID
 * @param {string} token - JWT auth token
 */
export const getReviewById = async (id, token) => {
  return request(`/reviews/${id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

/**
 * Delete a review by its ID
 * @param {string} id - Review ID
 * @param {string} token - JWT auth token
 */
export const deleteReview = async (id, token) => {
  return request(`/reviews/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

/**
 * Trigger Gemini AI analysis for a specific review
 * @param {string} id - Review ID
 * @param {string} token - JWT auth token
 */
export const analyzeReview = async (id, token) => {
  return request(`/reviews/${id}/analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

/**
 * Fetch the current analysis job status for a review (for polling and refresh recovery)
 * @param {string} id - Review ID
 * @param {string} token - JWT auth token
 */
export const getAnalysisStatus = async (id, token) => {
  return request(`/reviews/${id}/analysis-status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

/**
 * Retrieve dashboard metrics and analytics for authenticated user
 * @param {string} token - JWT auth token
 */
export const getDashboardStats = async (token) => {
  return request('/reviews/stats', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};



