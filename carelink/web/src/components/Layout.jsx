import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import LanguageToggle from './LanguageToggle.jsx';

export default function Layout({ children }) {
  const { staff, logout } = useAuth();
  const { t } = useI18n();
  const loc = useLocation();
  const link = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-2 text-sm rounded ${
        loc.pathname === to ? 'bg-sky-100 text-sky-800 font-medium' : 'hover:bg-gray-100'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-amber-100 text-amber-900 text-center text-xs py-1 px-2">
        {t('app.devBanner')}
      </div>
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="font-semibold text-sky-800 mr-2">{t('app.title')}</span>
          {link('/', t('nav.dashboard'))}
          {link('/clients', t('nav.clients'))}
          {link('/staff', t('nav.staff'))}
          <div className="ml-auto flex items-center gap-3">
            <LanguageToggle />
            <span className="text-sm text-gray-600">{staff?.name}</span>
            <button onClick={logout} className="text-sm text-sky-700 hover:underline">
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
