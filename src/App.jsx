import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SecurityProvider, useSecurity } from './context/SecurityContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import LockScreen from './pages/LockScreen';
import Home from './pages/Home';
import Chat from './pages/Chat';
import AdminDashboard from './pages/AdminDashboard';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();
  const { isLocked } = useSecurity();
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (isLocked) {
    return <LockScreen />;
  }

  return children;
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <SecurityProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } />
            <Route path="/chat/:userId" element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            } />
          </Routes>
        </SecurityProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
