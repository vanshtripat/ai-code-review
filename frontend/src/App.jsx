import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import NewReviewPage from './pages/NewReviewPage';
import ReviewHistoryPage from './pages/ReviewHistoryPage';
import ReviewDetailsPage from './pages/ReviewDetailsPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviews"
            element={
              <ProtectedRoute>
                <ReviewHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review/new"
            element={
              <ProtectedRoute>
                <NewReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review/:id"
            element={
              <ProtectedRoute>
                <ReviewDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
