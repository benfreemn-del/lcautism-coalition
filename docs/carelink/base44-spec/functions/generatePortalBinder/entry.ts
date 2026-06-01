import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId } = await req.json();

    // Fetch all documents, IEP, goals
    const documents = await base44.asServiceRole.entities.PortalDocument.filter({
      client_id: clientId,
    });

    const servicePlans = await base44.asServiceRole.entities.ServicePlan.filter({
      client_id: clientId,
    });

    const client = await base44.asServiceRole.entities.Client.filter({
      id: clientId,
    });

    const doc = new jsPDF();
    let y = 20;

    // Title
    doc.setFontSize(24);
    doc.text('Family Binder', 20, y);
    y += 10;

    if (client.length > 0) {
      doc.setFontSize(12);
      doc.text(`${client[0].legal_first_name} ${client[0].legal_last_name}`, 20, y);
      y += 10;
    }

    // Table of Contents
    doc.setFontSize(14);
    doc.text('Table of Contents', 20, y);
    y += 8;

    doc.setFontSize(10);
    const sections = ['Current IEP/504', 'Evaluations', 'Goals & Progress', 'Provider Directory', 'Important Dates'];
    sections.forEach(section => {
      doc.text(`• ${section}`, 25, y);
      y += 5;
    });

    y += 5;

    // Service Plans Section
    if (servicePlans.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Current Goals & Progress', 20, 20);
      y = 30;

      servicePlans.forEach(plan => {
        if (plan.goals?.length > 0) {
          doc.setFontSize(11);
          doc.text(`Plan: ${plan.plan_title}`, 20, y);
          y += 6;

          plan.goals.forEach(goal => {
            doc.setFontSize(10);
            doc.text(`Goal: ${goal.description}`, 25, y);
            doc.text(`Status: ${goal.status}`, 25, y + 5);
            y += 12;
          });
        }
      });
    }

    // Documents Section
    if (documents.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Documents & Forms', 20, 20);
      y = 30;

      documents.forEach(doc_item => {
        doc.setFontSize(10);
        doc.text(`${doc_item.name}`, 20, y);
        doc.text(`Category: ${doc_item.category}`, 25, y + 5);
        if (doc_item.uploaded_date) {
          doc.text(`Date: ${new Date(doc_item.uploaded_date).toLocaleDateString()}`, 25, y + 10);
        }
        y += 16;

        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      });
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=family-binder-${clientId}.pdf`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});