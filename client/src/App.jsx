import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from './context/AuthContext';
import { InstallPromptProvider } from './context/InstallPromptContext';
import { SignUp } from "./pages/Signup";
import { Login } from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Layout from "./components/Layout";
import ErrorBoundary from './components/ErrorBoundary';
import ChatContainer from "./components/ChatContainer";
import TicketScanner from "./pages/TicketScanner";
import TemplateManager from './pages/TemplateManager';
import Inventory from "./pages/Inventory";
import PaymentSuccess from "./pages/PaymentSuccess";

// ── Full-screen spinner shown while auth state is being read from localStorage ──
const AuthLoader = () => (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #fff 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: '3px solid #bbf7d0',
        borderTopColor: '#16a34a',
        animation: 'spin 0.7s linear infinite',
        margin: '0 auto 14px'
      }} />
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
        Loading…
      </p>
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const App = () => {
  // ✅ Always read loading from context — never render routes until loading is false
  const { isAuthenticated, loading } = useAuth();

  // ✅ Block everything until auth state is resolved — prevents the login flash
  if (loading) return <AuthLoader />;

  const PrivateRoute = ({ element }) => {
    return isAuthenticated ? element : <Navigate to="/login" replace />;
  };

  return (
    <ErrorBoundary>
      <InstallPromptProvider>
        <Router>
          <Routes>
            <Route
              path="/"
              element={<Navigate to={isAuthenticated ? "/admin/dashboard" : "/login"} replace />}
            />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<Login />} />
            <Route path="/scanner" element={<PrivateRoute element={<TicketScanner />} />} />
            <Route path="/admin" element={<PrivateRoute element={<Layout />} />}>
              <Route path="/admin/templates" element={<TemplateManager />} />
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="chats" element={<ChatContainer />} />
              <Route path="inventory" element={<Inventory />} />
            </Route>
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </InstallPromptProvider>
    </ErrorBoundary>
  );
};

export default App;
