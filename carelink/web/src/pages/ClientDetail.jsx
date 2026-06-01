import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n, languageLabel } from '../i18n/index.jsx';

export default function ClientDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const [client, setClient] = useState(null);
  const [appts, setAppts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');

  async function loadAll() {
    setError('');
    try {
      const [c, a, tk, s] = await Promise.all([
        api.get(`/clients/${id}`),
        api.get(`/appointments?client_id=${id}`),
        api.get(`/tasks`),
        api.get('/staff'),
      ]);
      setClient(c);
      setAppts(a);
      setTasks(tk.filter((x) => x.client_id === id));
      setStaff(s);
    } catch (err) {
      setError(err.status === 403 ? t('clients.notAuthorized') : err.message);
    }
  }
  useEffect(() => { loadAll(); }, [id]);

  async function assign(staffId) {
    await api.post('/assignments', { client_id: id, staff_member_id: staffId });
    loadAll();
  }
  async function addAppointment() {
    const title = prompt(t('common.title'));
    if (!title) return;
    await api.post('/appointments', {
      client_id: id, title,
      appointment_date: new Date(Date.now() + 86400000).toISOString(),
    });
    loadAll();
  }
  async function addTask() {
    const title = prompt(t('common.title'));
    if (!title) return;
    await api.post('/tasks', { client_id: id, title });
    loadAll();
  }
  async function completeTask(taskId) {
    await api.post(`/tasks/${taskId}/complete`);
    loadAll();
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!client) return <p>{t('common.loading')}</p>;

  const teamIds = new Set(client.care_team.filter((m) => m.status === 'active').map((m) => m.staff_id));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{client.full_name}
        <span className="text-base text-gray-500 ml-2">{client.client_id_number}</span>
      </h1>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-medium mb-2">{t('clients.demographics')}</h2>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-gray-500">{t('clients.preferredLanguage')}</dt>
          <dd>{languageLabel(t, client.preferred_language)}</dd>
          <dt className="text-gray-500">{t('clients.phone')}</dt>
          <dd>{client.primary_phone || '—'}</dd>
          <dt className="text-gray-500">{t('clients.status')}</dt>
          <dd>{client.status}</dd>
          <dt className="text-gray-500">{t('clients.household')}</dt>
          <dd>{client.household_name || '—'}</dd>
        </dl>
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-medium mb-2">{t('clients.careTeam')}</h2>
        <ul className="text-sm mb-3 space-y-1">
          {client.care_team.filter((m) => m.status === 'active').map((m) => (
            <li key={m.id}>{m.staff_name} — {m.role}{m.is_primary ? ` (${t('clients.primary')})` : ''}</li>
          ))}
        </ul>
        <div className="text-sm">
          <span className="text-gray-500 mr-2">{t('clients.assign')}:</span>
          {staff.filter((s) => !teamIds.has(s.id)).map((s) => (
            <button key={s.id} onClick={() => assign(s.id)}
              className="mr-2 mb-1 border rounded px-2 py-1 hover:bg-gray-100">
              + {s.name}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center mb-2">
          <h2 className="font-medium flex-1">{t('clients.appointments')}</h2>
          <button onClick={addAppointment} className="text-sm text-sky-700 hover:underline">+ {t('clients.addAppointment')}</button>
        </div>
        <ul className="text-sm space-y-1">
          {appts.map((a) => (
            <li key={a.id}>{new Date(a.appointment_date).toLocaleString()} — {a.title} ({a.status})</li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center mb-2">
          <h2 className="font-medium flex-1">{t('clients.tasks')}</h2>
          <button onClick={addTask} className="text-sm text-sky-700 hover:underline">+ {t('clients.addTask')}</button>
        </div>
        <ul className="text-sm space-y-1">
          {tasks.map((tk) => (
            <li key={tk.id} className="flex items-center gap-2">
              <span className="flex-1">{tk.title} — {tk.status}</span>
              {tk.status !== 'Complete' && (
                <button onClick={() => completeTask(tk.id)} className="text-xs bg-emerald-600 text-white rounded px-2 py-0.5">
                  {t('dashboard.complete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
