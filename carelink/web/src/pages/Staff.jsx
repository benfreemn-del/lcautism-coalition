import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../i18n/index.jsx';

export default function Staff() {
  const { t } = useI18n();
  const [staff, setStaff] = useState(null);
  useEffect(() => { api.get('/staff').then(setStaff); }, []);
  if (!staff) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t('staff.heading')}</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">{t('staff.name')}</th>
              <th className="px-4 py-2">{t('staff.email')}</th>
              <th className="px-4 py-2">{t('staff.roles')}</th>
              <th className="px-4 py-2">{t('staff.languages')}</th>
              <th className="px-4 py-2">{t('staff.admin')}</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2">{s.name}</td>
                <td className="px-4 py-2 text-gray-600">{s.email}</td>
                <td className="px-4 py-2">{(s.roles || []).join(', ')}</td>
                <td className="px-4 py-2">{(s.languages || []).join(', ')}</td>
                <td className="px-4 py-2">{s.is_org_admin ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
