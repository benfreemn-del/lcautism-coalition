import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n, languageLabel } from '../i18n/index.jsx';

export default function Clients() {
  const { t } = useI18n();
  const [clients, setClients] = useState(null);
  useEffect(() => { api.get('/clients').then(setClients); }, []);
  if (!clients) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t('clients.heading')}</h1>
      {clients.length === 0 && <p className="text-sm text-gray-500">{t('clients.none')}</p>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">{t('clients.idNumber')}</th>
              <th className="px-4 py-2">{t('clients.name')}</th>
              <th className="px-4 py-2">{t('clients.language')}</th>
              <th className="px-4 py-2">{t('clients.household')}</th>
              <th className="px-4 py-2">{t('clients.status')}</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500">{c.client_id_number}</td>
                <td className="px-4 py-2">
                  <Link to={`/clients/${c.id}`} className="text-sky-700 hover:underline">{c.full_name}</Link>
                </td>
                <td className="px-4 py-2">{languageLabel(t, c.preferred_language)}</td>
                <td className="px-4 py-2">{c.household_name || '—'}</td>
                <td className="px-4 py-2">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
