import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { useI18n } from './i18n/index.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import Staff from './pages/Staff.jsx';
import Intake from './pages/Intake.jsx';

function Protected({ children }) {
  const { staff, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <div className="p-8">{t('common.loading')}</div>;
  if (!staff) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/intake" element={<Intake />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/clients" element={<Protected><Clients /></Protected>} />
      <Route path="/clients/:id" element={<Protected><ClientDetail /></Protected>} />
      <Route path="/staff" element={<Protected><Staff /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
