import { BrowserRouter, Routes, Route, Navigate } from './router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import NewVisitPage from './pages/NewVisitPage';
import VisitsPage from './pages/VisitsPage';
import VisitDetailPage from './pages/VisitDetailPage';
import EditVisitPage from './pages/EditVisitPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="new-visit" element={<NewVisitPage />} />
        <Route path="visits" element={<VisitsPage />} />
        <Route path="visits/:id" element={<VisitDetailPage />} />
        <Route path="visits/:id/edit" element={<EditVisitPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
