// PUBLIC intake form (no login). Posts to /api/intake which creates a pending
// client + submission. Bilingual like the rest of the app.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../i18n/index.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';

export default function Intake() {
  const { t } = useI18n();
  const [form, setForm] = useState({
    legal_first_name: '', legal_last_name: '', caregiver_name: '',
    primary_phone: '', email: '', preferred_language: 'English',
    contact_reason: '', notes: '',
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/intake', form);
      setDone(true);
    } catch {
      setError(t('intake.error'));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex justify-end my-2"><LanguageToggle /></div>
        <div className="bg-amber-100 text-amber-900 text-xs px-3 py-1 rounded mb-4 text-center">
          {t('app.devBanner')}
        </div>
        {done ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-emerald-700">{t('intake.thanks')}</p>
            <Link to="/login" className="text-sky-700 hover:underline text-sm mt-4 inline-block">{t('intake.goLogin')}</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="bg-white rounded-lg shadow p-6 space-y-3">
            <h1 className="text-xl font-semibold text-sky-800">{t('intake.heading')}</h1>
            <p className="text-sm text-gray-600">{t('intake.intro')}</p>
            <Field label={t('intake.firstName')} value={form.legal_first_name} onChange={set('legal_first_name')} required />
            <Field label={t('intake.lastName')} value={form.legal_last_name} onChange={set('legal_last_name')} required />
            <Field label={t('intake.caregiver')} value={form.caregiver_name} onChange={set('caregiver_name')} required />
            <Field label={t('intake.phone')} value={form.primary_phone} onChange={set('primary_phone')} />
            <Field label={t('intake.email')} value={form.email} onChange={set('email')} type="email" />
            <div>
              <label className="block text-sm mb-1">{t('intake.preferredLanguage')}</label>
              <select value={form.preferred_language} onChange={set('preferred_language')} className="w-full border rounded px-3 py-2">
                <option value="English">{t('common.english')}</option>
                <option value="Spanish">{t('common.spanish')}</option>
              </select>
            </div>
            <Field label={t('intake.reason')} value={form.contact_reason} onChange={set('contact_reason')} />
            <div>
              <label className="block text-sm mb-1">{t('intake.notes')}</label>
              <textarea value={form.notes} onChange={set('notes')} className="w-full border rounded px-3 py-2" rows={3} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="w-full bg-sky-700 text-white rounded py-2 hover:bg-sky-800">{t('intake.submit')}</button>
            <Link to="/login" className="block text-center text-sm text-sky-700 hover:underline">{t('intake.goLogin')}</Link>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, type = 'text', ...props }) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <input type={type} className="w-full border rounded px-3 py-2" {...props} />
    </div>
  );
}
