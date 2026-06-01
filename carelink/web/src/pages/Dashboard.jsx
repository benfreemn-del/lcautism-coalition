import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../i18n/index.jsx';

export default function Dashboard() {
  const { staff } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState(null);

  async function load() {
    setData(await api.get('/dashboard'));
  }
  useEffect(() => { load(); }, []);

  async function complete(id) {
    await api.post(`/tasks/${id}/complete`);
    load();
  }

  if (!data) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">{t('dashboard.heading')}</h1>
      <p className="text-gray-600 mb-6">{t('dashboard.welcome')}, {staff?.name}</p>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="font-medium mb-3">{t('dashboard.todayAppointments')}</h2>
          {data.today_appointments.length === 0 && <p className="text-sm text-gray-500">{t('dashboard.none')}</p>}
          <ul className="space-y-2">
            {data.today_appointments.map((a) => (
              <li key={a.id} className="border rounded p-2 text-sm">
                <div className="font-medium">{new Date(a.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {a.title}</div>
                <Link to={`/clients/${a.client_id}`} className="text-sky-700 hover:underline">{a.client_name}</Link>
                <span className="text-gray-500"> · {a.appointment_type}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="font-medium mb-3">{t('dashboard.openTasks')}</h2>
          {data.open_tasks.length === 0 && <p className="text-sm text-gray-500">{t('dashboard.none')}</p>}
          <ul className="space-y-2">
            {data.open_tasks.map((tk) => (
              <li key={tk.id} className="border rounded p-2 text-sm flex items-center gap-2">
                <div className="flex-1">
                  <div className="font-medium">{tk.title}</div>
                  <span className="text-gray-500">
                    {tk.priority}{tk.due_date ? ` · ${tk.due_date}` : ''}
                    {tk.client_name ? ` · ${tk.client_name}` : ''}
                  </span>
                </div>
                <button onClick={() => complete(tk.id)} className="text-xs bg-emerald-600 text-white rounded px-2 py-1 hover:bg-emerald-700">
                  {t('dashboard.complete')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
