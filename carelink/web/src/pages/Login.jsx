import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';

export default function Login() {
  const { staff, login } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (staff) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      nav('/');
    } catch (err) {
      setError(err.message || t('login.error'));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="absolute top-3 right-3"><LanguageToggle /></div>
      <div className="bg-amber-100 text-amber-900 text-xs px-3 py-1 rounded mb-4">
        {t('app.devBanner')}
      </div>
      <form onSubmit={onSubmit} className="bg-white rounded-lg shadow p-6 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-sky-800 mb-4">{t('login.heading')}</h1>
        <label className="block text-sm mb-1">{t('login.email')}</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-3" required
        />
        <label className="block text-sm mb-1">{t('login.password')}</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-1"
        />
        <p className="text-xs text-gray-500 mb-3">{t('login.passwordHint')}</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button className="w-full bg-sky-700 text-white rounded py-2 hover:bg-sky-800">
          {t('login.submit')}
        </button>
        <div className="text-xs text-gray-500 mt-4 space-y-1">
          <p>{t('login.demoAdmin')}</p>
          <p>{t('login.demoCoord')}</p>
        </div>
        <Link to="/intake" className="block text-center text-sm text-sky-700 hover:underline mt-4">
          {t('intake.heading')} →
        </Link>
      </form>
    </div>
  );
}
