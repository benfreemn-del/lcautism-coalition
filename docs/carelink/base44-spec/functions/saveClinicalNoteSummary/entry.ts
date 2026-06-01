import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    
    // Handle both direct calls and automation triggers
    let clinicalNoteId = payload.clinicalNoteId;
    
    // If called from automation, extract note ID from event data
    if (!clinicalNoteId && payload.event?.entity_id) {
      clinicalNoteId = payload.event.entity_id;
    }

    if (!clinicalNoteId) {
      return Response.json({ error: 'Missing clinical note ID' }, { status: 400 });
    }

    // Get the clinical note
    const note = await base44.entities.ClinicalNote.get(clinicalNoteId);
    
    if (!note) {
      return Response.json({ error: 'Clinical note not found' }, { status: 404 });
    }

    // Get client details
    const clients = await base44.entities.Client.filter({ client_id_number: note.client_id });
    const client = clients.length > 0 ? clients[0] : null;

    // Create PDF
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(0, 151, 167); // Teal
    doc.text('Spectrum and Development Community Center', 20, 20);
    doc.setFontSize(14);
    doc.setTextColor(26, 58, 92); // Navy
    doc.text('Clinical Note Summary', 20, 30);
    
    // Client Info
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`Client Name: ${note.client_name}`, 20, 45);
    doc.text(`Client ID: ${note.client_id || 'N/A'}`, 20, 52);
    doc.text(`Note Type: ${note.note_type || 'Not specified'}`, 20, 59);
    doc.text(`Session Date: ${note.session_date ? new Date(note.session_date).toLocaleDateString() : 'N/A'}`, 20, 66);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 73);

    let yPos = 90;

    // Session Details
    doc.setFontSize(12);
    doc.setTextColor(0, 151, 167);
    doc.text('Session Details', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    if (note.start_time && note.end_time) {
      doc.text(`Time: ${note.start_time} - ${note.end_time}`, 20, yPos);
      yPos += 7;
    }
    
    if (note.duration_minutes) {
      doc.text(`Duration: ${note.duration_minutes} minutes`, 20, yPos);
      yPos += 7;
    }
    
    if (note.location) {
      doc.text(`Location: ${note.location}`, 20, yPos);
      yPos += 7;
    }
    
    if (note.participants && note.participants.length > 0) {
      doc.text(`Participants: ${note.participants.join(', ')}`, 20, yPos);
      yPos += 7;
    }

    yPos += 5;

    // Note Body
    if (note.note_body) {
      doc.setFontSize(12);
      doc.setTextColor(0, 151, 167);
      doc.text('Narrative / Context', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      const narrativeText = doc.splitTextToSize(note.note_body, 170);
      doc.text(narrativeText, 20, yPos);
      yPos += narrativeText.length * 5 + 5;
    }

    // Intervention
    if (note.intervention) {
      doc.setFontSize(12);
      doc.setTextColor(0, 151, 167);
      doc.text('Intervention', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      const interventionText = doc.splitTextToSize(note.intervention, 170);
      doc.text(interventionText, 20, yPos);
      yPos += interventionText.length * 5 + 5;
    }

    // Outcome
    if (note.outcome) {
      doc.setFontSize(12);
      doc.setTextColor(0, 151, 167);
      doc.text('Outcome', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      const outcomeText = doc.splitTextToSize(note.outcome, 170);
      doc.text(outcomeText, 20, yPos);
      yPos += outcomeText.length * 5 + 5;
    }

    // Follow-up Plan
    if (note.follow_up_plan) {
      doc.setFontSize(12);
      doc.setTextColor(0, 151, 167);
      doc.text('Follow-up Plan', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      const followUpText = doc.splitTextToSize(note.follow_up_plan, 170);
      doc.text(followUpText, 20, yPos);
      yPos += followUpText.length * 5 + 5;
    }

    // Billing Codes
    if (note.billing_codes && note.billing_codes.length > 0) {
      yPos += 5;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Billing Codes: ${note.billing_codes.join(', ')}`, 20, yPos);
      yPos += 7;
    }

    // Provider Info
    yPos += 5;
    if (note.provider_name || note.authored_by) {
      doc.text(`Provider: ${note.provider_name || note.authored_by}`, 20, yPos);
      yPos += 7;
    }

    if (note.signature_data?.signed_by && note.signature_data?.signed_timestamp) {
      doc.text(`Signed by: ${note.signature_data.signed_by}`, 20, yPos);
      yPos += 7;
      doc.text(`Signed on: ${new Date(note.signature_data.signed_timestamp).toLocaleString()}`, 20, yPos);
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`Generated by ${user.email} on ${new Date().toLocaleString()}`, 20, 280);
    }

    // Convert to blob and upload
    const pdfBytes = doc.output('arraybuffer');
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    // Upload file
    const uploadResult = await base44.integrations.Core.UploadFile({ file: blob });
    const documentUrl = uploadResult.file_url;
    
    // Create document record in PortalDocument entity
    await base44.entities.PortalDocument.create({
      client_id: note.client_id,
      name: `Clinical Note Summary - ${note.note_type || 'Session'} - ${note.session_date ? new Date(note.session_date).toLocaleDateString() : 'N/A'}`,
      category: 'assessment_results',
      description: `Clinical note summary generated on ${new Date().toLocaleDateString()}`,
      file_url: documentUrl,
      family_visible: true,
      document_type: 'other',
      uploaded_by: user.email,
      uploaded_date: new Date().toISOString(),
      language: 'both',
      bilingual_available: true
    });

    return Response.json({ 
      success: true, 
      message: 'Clinical note summary saved to client file',
      document_url: documentUrl
    });
  } catch (error) {
    console.error('Error generating clinical note summary:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});