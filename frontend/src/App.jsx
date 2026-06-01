import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import LoadingSpinner from './components/ui/LoadingSpinner';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TenantsPage from './pages/TenantsPage';
import LeasesPage from './pages/LeasesPage';
import PaymentsPage from './pages/PaymentsPage';
import MessagesPage from './pages/MessagesPage';
import NoticesPage from './pages/NoticesPage';
import MaintenancePage from './pages/MaintenancePage';
import TenantPortalPage from './pages/TenantPortalPage';
import PropertiesPage from './pages/PropertiesPage';
import ProfilePage from './pages/ProfilePage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import AgentPage from './pages/AgentPage';
import AutopilotTimelinePage from './pages/AutopilotTimelinePage';
import ImportPage from './pages/ImportPage';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'LANDLORD' ? '/dashboard' : '/tenant'} replace />;
  }
  return children;
};

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={user ? <Navigate to={user.role === 'LANDLORD' ? '/dashboard' : '/tenant'} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={user.role === 'LANDLORD' ? '/dashboard' : '/tenant'} replace /> : <RegisterPage />} />

      {/* Landlord routes */}
      <Route
        element={
          <ProtectedRoute role="LANDLORD">
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/properties" element={<PropertiesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        <Route path="/leases" element={<LeasesPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/notices" element={<NoticesPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/timeline" element={<AutopilotTimelinePage />} />
        <Route path="/import" element={<ImportPage />} />
      </Route>

      <Route path="/payment/success" element={<PaymentSuccessPage />} />

      {/* Tenant portal */}
      <Route
        path="/tenant"
        element={
          <ProtectedRoute role="TENANT">
            <TenantPortalPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
