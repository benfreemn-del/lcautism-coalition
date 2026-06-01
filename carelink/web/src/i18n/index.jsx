// i18n context + hook. Language toggle is available anywhere (requirement #5).
// Persists the choice; defaults to the browser language if Spanish.
import { createContext, useContext, useEffect, useState } from 'react';
import en from './en.js';
import es from './es.js';

const BUNDLES = { en, es };
const I18nContext = createContext(null);

function detectInitial() {
  const saved = localStorage.getItem('carelink.lang');
  if (saved === 'en' || saved === 'es') return saved;
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

// Resolve a dotted key path like "clients.careTeam" against the active bundle.
function resolve(bundle, key) {
  return key.split('.').reduce((o, k) => (o == null ? o : o[k]), bundle) ?? key;
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(detectInitial);
  useEffect(() => {
    localStorage.setItem('carelink.lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const t = (key) => resolve(BUNDLES[lang], key);
  const toggle = () => setLang((l) => (l === 'en' ? 'es' : 'en'));
  return (
    <I18nContext.Provider value={{ lang, setLang, toggle, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

// Map a backend preferred_language ('English'/'Spanish') to a UI label.
export function languageLabel(t, value) {
  if (value === 'Spanish') return t('common.spanish');
  if (value === 'English') return t('common.english');
  return value || '';
}
