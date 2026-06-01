// Language switcher — available anywhere via the header (requirement #5).
import { useI18n } from '../i18n/index.jsx';

export default function LanguageToggle() {
  const { lang, toggle, t } = useI18n();
  return (
    <button
      onClick={toggle}
      className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
      title={t('nav.language')}
    >
      {lang === 'en' ? 'EN' : 'ES'} · {lang === 'en' ? t('common.spanish') : t('common.english')}
    </button>
  );
}
