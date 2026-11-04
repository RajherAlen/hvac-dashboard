import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppShell } from './components/layout/AppShell';

// Pages
import { LoginPage } from './pages/auth/LoginPage';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';
import { AdminDashboardPage } from './pages/admin/DashboardPage';
import { AdminEmployeesPage } from './pages/admin/EmployeesPage';
import { AdminEmployeeDetailPage } from './pages/admin/EmployeeDetailPage';
import { MyDashboardPage } from './pages/employee/MyDashboardPage';
import { LogWorkPage } from './pages/employee/LogWorkPage';
import { MyHistoryPage } from './pages/employee/MyHistoryPage';
import { ClientsPage } from './pages/clients/ClientsPage';
import { ClientDetailPage } from './pages/clients/ClientDetailPage';
import { LinkLegacyPage } from './pages/clients/LinkLegacyPage';
import { ServicesPage } from './pages/services/ServicesPage';
import { SchedulePage } from './pages/schedule/SchedulePage';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50" role="status">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <span className="sr-only">Učitavanje…</span>
    </div>
  );
}

function RootRedirect() {
  const { session, role, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!session) navigate('/login', { replace: true });
    else if (role === 'admin') navigate('/admin/dashboard', { replace: true });
    else navigate('/my/dashboard', { replace: true });
  }, [isLoading, session, role, navigate]);

  return <Spinner />;
}

function RequireAuth({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'employee';
}) {
  const { session, role, isLoading } = useAuth();

  if (isLoading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (requiredRole === 'admin' && role !== 'admin') return <Navigate to="/my/dashboard" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  const { session, role } = useAuth();
  const loginRedirect = session ? (role === 'admin' ? '/admin/dashboard' : '/my/dashboard') : null;

  return (
    <Routes>
      <Route path="/login" element={loginRedirect ? <Navigate to={loginRedirect} replace /> : <LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Admin */}
      <Route element={<RequireAuth requiredRole="admin"><AppShell /></RequireAuth>}>
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/employees" element={<AdminEmployeesPage />} />
        <Route path="/admin/employees/:id" element={<AdminEmployeeDetailPage />} />
      </Route>

      {/* Employee */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/my/dashboard" element={<MyDashboardPage />} />
        <Route path="/my/log" element={<LogWorkPage />} />
        <Route path="/my/history" element={<MyHistoryPage />} />
        {/* Klijenti – zajednički; tehničar vidi i dodaje, admin uređuje */}
        <Route path="/klijenti" element={<ClientsPage />} />
        <Route path="/klijenti/:id" element={<ClientDetailPage />} />
      </Route>

      <Route element={<RequireAuth requiredRole="admin"><AppShell /></RequireAuth>}>
        <Route path="/klijenti/povezivanje" element={<LinkLegacyPage />} />
        <Route path="/servisi" element={<ServicesPage />} />
        <Route path="/raspored" element={<SchedulePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-center"
            richColors
            closeButton
            containerAriaLabel="Obavijesti"
            toastOptions={{
              closeButtonAriaLabel: 'Zatvori obavijest',
              duration: 5000,
              // Zadane "rich" boje imaju preslab kontrast (zeleno #008a2e na svijetlozelenom ≈ 4,3:1)
              classNames: { success: '!text-emerald-900', error: '!text-red-900' },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
