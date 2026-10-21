import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../services/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else {
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = 'Please enter a valid email address';
      }
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: ''
      }));
    }
    if (serverError) setServerError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await loginUser({
        email: formData.email.trim(),
        password: formData.password
      });

      if (result.success && result.token && result.user) {
        login(result.token, result.user);
        navigate(from, { replace: true });
      } else {
        setServerError('Login failed. Please check your credentials.');
      }
    } catch (error) {
      setServerError(error.message || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-800/90 border border-slate-700 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="text-center mb-6">
          <Link
            to="/"
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-block mb-3"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Welcome Back
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Sign in to your AI Code Review account
          </p>
        </div>

        {serverError && (
          <div
            role="alert"
            className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-sm leading-relaxed"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="you@example.com"
              className={`w-full px-3.5 py-2.5 bg-slate-900/80 border ${
                errors.email ? 'border-rose-500' : 'border-slate-700 focus:border-indigo-500'
              } rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-rose-400">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="Enter your password"
              className={`w-full px-3.5 py-2.5 bg-slate-900/80 border ${
                errors.password ? 'border-rose-500' : 'border-slate-700 focus:border-indigo-500'
              } rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50`}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-rose-400">{errors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-lg text-sm transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  ></path>
                </svg>
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400 border-t border-slate-700/60 pt-4">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="text-indigo-400 hover:text-indigo-300 font-medium underline-offset-2 hover:underline"
          >
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
