import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import jsPDF from 'npm:jspdf@4.2.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId } = await req.json();
    if (!clientId) {
      return Response.json({ error: 'Missing clientId' }, { status: 400 });
    }

    // Fetch all data in parallel
    const [client, submissions, tasks, screenings, outgoingReferrals, clinicalNotes, servicePlans, appointments] = await Promise.all([
      base44.entities.Client.get(clientId),
      base44.entities.Submission.filter({ client_id: clientId }, '-created_date', 50),
      base44.entities.Task.filter({ client_id: clientId }, '-created_date', 50),
      base44.entities.Screening.filter({ client_id: clientId }, '-administered_date', 20),
      base44.entities.OutgoingReferral.filter({ client_id: clientId }, '-created_date', 20),
      base44.entities.ClinicalNote.filter({ client_id: clientId }, '-session_date', 20),
      base44.entities.ServicePlan.filter({ client_id: clientId }, '-created_date', 5),
      base44.entities.Appointment.filter({ client_id: clientId }, '-appointment_date', 20),
    ]);

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentW = pageW - margin * 2;
    let y = margin;

    const clientName = `${client.legal_first_name} ${client.legal_last_name}`;
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Header banner ──────────────────────────────────────────────────────────
    doc.setFillColor(26, 58, 92);
    doc.rect(0, 0, pageW, 90, 'F');

    doc.setFillColor(0, 151, 167);
    doc.circle(margin + 20, 45, 20, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('LC', margin + 20, 50, { align: 'center' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Lewis County Autism Coalition', margin + 50, 35);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(178, 235, 242);
    doc.text('LCAC Connect — Clinical Documentation System', margin + 50, 55);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 168, 37);
    doc.text('FULL CASE SUMMARY & SERVICE HISTORY', pageW - margin, 35, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(178, 235, 242);
    doc.text(today, pageW - margin, 55, { align: 'right' });

    y = 110;

    // ── Client Info Box ────────────────────────────────────────────────────────
    doc.setFillColor(224, 247, 250);
    doc.roundedRect(margin, y, contentW, 80, 4, 4, 'F');

    const infoLeft = margin + 12;
    const infoRight = pageW / 2 + 20;

    const addInfoRow = (label, value, x, yPos) => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 105, 120);
      doc.text(label, x, yPos);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(26, 58, 92);
      doc.text(value || '—', x + 75, yPos);
    };

    addInfoRow('Client Name:', clientName, infoLeft, y + 18);
    addInfoRow('DOB:', client.dob ? new Date(client.dob).toLocaleDateString() : '—', infoLeft, y + 34);
    addInfoRow('Client ID:', client.client_id_number || '—', infoLeft, y + 50);
    addInfoRow('Language:', client.preferred_language || 'English', infoLeft, y + 66);

    addInfoRow('Status:', client.status || 'Active', infoRight, y + 18);
    addInfoRow('Programs:', (client.programs || []).join(', ') || '—', infoRight, y + 34);
    addInfoRow('Insurance:', client.insurance_provider || '—', infoRight, y + 50);
    addInfoRow('Caregiver:', client.caregiver_name || '—', infoRight, y + 66);

    y += 98;

    // ── Section Helper ─────────────────────────────────────────────────────────
    const addSection = (title, color) => {
      if (y + 40 > pageH - 60) { addFooter(doc, pageW, pageH, margin); doc.addPage(); y = margin; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 58, 92);
      doc.text(title, margin, y);
      y += 14;
      if (color === 'teal') doc.setDrawColor(0, 151, 167);
      else if (color === 'gold') doc.setDrawColor(249, 168, 37);
      else doc.setDrawColor(94, 53, 177);
      doc.setLineWidth(1.5);
      doc.line(margin, y, margin + contentW, y);
      y += 12;
    };

    const addRow = (text, subtext) => {
      if (y + 22 > pageH - 60) { addFooter(doc, pageW, pageH, margin); doc.addPage(); y = margin; }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      const wrapped = doc.splitTextToSize(text, contentW - 20);
      wrapped.forEach(line => { doc.text(line, margin + 10, y); y += 12; });
      if (subtext) {
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(subtext, margin + 10, y);
        y += 11;
      }
      y += 3;
    };

    const addEmptyState = (msg) => {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(150, 150, 150);
      doc.text(msg, margin + 10, y);
      y += 18;
    };

    // ── 1. Service Plans ───────────────────────────────────────────────────────
    addSection('1. Service Plans', 'teal');
    if (servicePlans.length > 0) {
      servicePlans.forEach(sp => {
        addRow(
          `${sp.plan_type || 'Service Plan'} — ${sp.status || ''}`,
          `Created: ${sp.created_date ? new Date(sp.created_date).toLocaleDateString() : '—'} · Goals: ${(sp.goals || []).length}`
        );
      });
    } else { addEmptyState('No service plans on file.'); }

    // ── 2. Appointments ────────────────────────────────────────────────────────
    addSection('2. Appointment History', 'teal');
    if (appointments.length > 0) {
      appointments.forEach(appt => {
        addRow(
          `${appt.title || appt.appointment_type} — ${appt.status || ''}`,
          `${appt.appointment_date ? new Date(appt.appointment_date).toLocaleDateString() : '—'} · Provider: ${appt.provider || '—'} · Location: ${appt.location || '—'}`
        );
      });
    } else { addEmptyState('No appointments recorded.'); }

    // ── 3. Screenings ──────────────────────────────────────────────────────────
    addSection('3. Developmental Screenings', 'gold');
    if (screenings.length > 0) {
      screenings.forEach(s => {
        addRow(
          `${s.tool} — Result: ${s.result || '—'}`,
          `Date: ${s.administered_date ? new Date(s.administered_date).toLocaleDateString() : '—'} · Administered by: ${s.administered_by || '—'} · Age: ${s.age_months ? s.age_months + ' months' : '—'}`
        );
      });
    } else { addEmptyState('No screenings on file.'); }

    // ── 4. Clinical Notes ──────────────────────────────────────────────────────
    addSection('4. Clinical Notes', 'teal');
    if (clinicalNotes.length > 0) {
      clinicalNotes.forEach(n => {
        addRow(
          `${n.note_type || 'Note'} — ${n.status || ''}`,
          `Session: ${n.session_date ? new Date(n.session_date).toLocaleDateString() : '—'} · Provider: ${n.provider_name || '—'}${n.intervention ? ' · ' + n.intervention.slice(0, 80) : ''}`
        );
      });
    } else { addEmptyState('No clinical notes on file.'); }

    // ── 5. Outgoing Referrals ──────────────────────────────────────────────────
    addSection('5. Provider Referrals', 'gold');
    if (outgoingReferrals.length > 0) {
      outgoingReferrals.forEach(r => {
        addRow(
          `${r.provider_name || '—'} — ${r.referral_type || ''} [${r.status || ''}]`,
          `Sent: ${r.date_sent ? new Date(r.date_sent).toLocaleDateString() : '—'} · Consent: ${r.consent_obtained ? 'Yes' : 'No'}${r.reason ? ' · ' + r.reason.slice(0, 80) : ''}`
        );
      });
    } else { addEmptyState('No outgoing referrals.'); }

    // ── 6. Tasks ───────────────────────────────────────────────────────────────
    addSection('6. Case Tasks', 'purple');
    if (tasks.length > 0) {
      tasks.forEach(t => {
        addRow(
          `[${t.status}] ${t.title}`,
          `Due: ${t.due_date || '—'} · Priority: ${t.priority || '—'} · Assigned: ${t.assigned_to || '—'}`
        );
      });
    } else { addEmptyState('No tasks recorded.'); }

    // ── 7. Form Submissions ────────────────────────────────────────────────────
    addSection('7. Form Submissions', 'purple');
    if (submissions.length > 0) {
      submissions.forEach((s, idx) => {
        addRow(
          `${idx + 1}. ${s.form_title || s.form_type || 'Form'} (${s.status || 'Complete'})`,
          new Date(s.created_date).toLocaleDateString()
        );
      });
    } else { addEmptyState('No form submissions on file.'); }

    // ── Footer on last page ────────────────────────────────────────────────────
    addFooter(doc, pageW, pageH, margin);

    const pdfBytes = doc.output('arraybuffer');
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="LCAC_FullCaseSummary_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf"`
      }
    });
  } catch (error) {
    console.error('Error generating case summary PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function addFooter(doc, pageW, pageH, margin) {
  doc.setFillColor(241, 245, 249);
  doc.rect(0, pageH - 36, pageW, 36, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Lewis County Autism Coalition — CONFIDENTIAL — For Authorized Use Only — LCAC Connect', pageW / 2, pageH - 20, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW / 2, pageH - 10, { align: 'center' });
}