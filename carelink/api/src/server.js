// LCAC CareLink — dev API server (Hono on node).
// DEV SCAFFOLD ONLY. No real PHI, local Postgres only, stub auth.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { requireAuth } from './lib/auth.js';
import { authRoutes } from './routes/auth.js';
import { staffRoutes } from './routes/staff.js';
import { clientRoutes } from './routes/clients.js';
import { assignmentRoutes } from './routes/assignments.js';
import { appointmentRoutes } from './routes/appointments.js';
import { taskRoutes } from './routes/tasks.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { intakeRoutes } from './routes/intake.js';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

app.get('/api/health', (c) => c.json({ ok: true, service: 'carelink-api (dev)' }));

// Public endpoints (no auth): login + intake form.
app.route('/api/auth', authRoutes); // note: /me below is protected separately
app.route('/api/intake', intakeRoutes);

// Everything else requires a (stub) staff session.
app.use('/api/*', requireAuth());
app.route('/api/staff', staffRoutes);
app.route('/api/clients', clientRoutes);
app.route('/api/assignments', assignmentRoutes);
app.route('/api/appointments', appointmentRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/dashboard', dashboardRoutes);

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[carelink-api] DEV server on http://localhost:${info.port}`);
  console.log('[carelink-api] Stub auth + local Postgres only. No real PHI.');
});
