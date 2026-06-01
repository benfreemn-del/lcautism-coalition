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
    let workflowId = payload.workflowId;
    let saveToClient = payload.saveToClient || false;
    
    // If called from automation, extract workflow ID from event data
    if (!workflowId && payload.event?.entity_id) {
      workflowId = payload.event.entity_id;
      // For automations, always save to client
      saveToClient = true;
    }

    if (!workflowId) {
      return Response.json({ error: 'Missing workflow ID' }, { status: 400 });
    }

    const workflow = await base44.entities.ClientWorkflow.get(workflowId);
    
    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Get client details
    const client = await base44.entities.Client.get(workflow.client_id);

    // Create PDF
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(0, 151, 167); // Teal
    doc.text('Spectrum and Development Community Center', 20, 20);
    doc.setFontSize(14);
    doc.setTextColor(26, 58, 92); // Navy
    doc.text('Client Workflow Summary', 20, 30);
    
    // Client Info
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`Client Name: ${client?.legal_first_name || ''} ${client?.legal_last_name || ''}`, 20, 45);
    doc.text(`Client ID: ${workflow.client_id}`, 20, 52);
    doc.text(`Workflow ID: ${workflowId}`, 20, 59);
    doc.text(`Visit Type: ${workflow.visit_type || 'Not specified'}`, 20, 66);
    doc.text(`Status: ${workflow.workflow_status}`, 20, 73);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 80);

    // Service Plan Section
    let yPos = 95;
    if (workflow.service_plan) {
      doc.setFontSize(12);
      doc.setTextColor(0, 151, 167);
      doc.text('Service Plan', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      if (workflow.service_plan.goals?.length > 0) {
        doc.text('Goals:', 20, yPos);
        yPos += 7;
        workflow.service_plan.goals.forEach((goal, idx) => {
          const goalText = `${idx + 1}. ${goal.description || 'No description'} (Status: ${goal.status || 'pending'})`;
          const splitText = doc.splitTextToSize(goalText, 170);
          doc.text(splitText, 25, yPos);
          yPos += splitText.length * 5;
        });
        yPos += 5;
      }
      
      if (workflow.service_plan.family_priorities?.length > 0) {
        doc.text('Family Priorities:', 20, yPos);
        yPos += 7;
        workflow.service_plan.family_priorities.forEach((priority, idx) => {
          doc.text(`${idx + 1}. ${priority}`, 25, yPos);
          yPos += 5;
        });
        yPos += 5;
      }
      
      if (workflow.service_plan.next_steps?.length > 0) {
        doc.text('Next Steps:', 20, yPos);
        yPos += 7;
        workflow.service_plan.next_steps.forEach((step, idx) => {
          doc.text(`${idx + 1}. ${step}`, 25, yPos);
          yPos += 5;
        });
        yPos += 5;
      }
    }

    // Feedback Section
    if (workflow.feedback) {
      yPos += 10;
      doc.setFontSize(12);
      doc.setTextColor(0, 151, 167);
      doc.text('Family Feedback', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      if (workflow.feedback.overall_rating) {
        doc.text(`Overall Rating: ${workflow.feedback.overall_rating}/5`, 20, yPos);
        yPos += 7;
      }
      
      if (workflow.feedback.what_helped) {
        doc.text('What Helped:', 20, yPos);
        yPos += 7;
        const helpedText = doc.splitTextToSize(workflow.feedback.what_helped, 170);
        doc.text(helpedText, 25, yPos);
        yPos += helpedText.length * 5;
      }
      
      if (workflow.feedback.hopes_next_visit) {
        doc.text('Hopes for Next Visit:', 20, yPos);
        yPos += 7;
        const hopesText = doc.splitTextToSize(workflow.feedback.hopes_next_visit, 170);
        doc.text(hopesText, 25, yPos);
        yPos += hopesText.length * 5;
      }
    }

    // Phase Timeline
    yPos += 10;
    doc.setFontSize(12);
    doc.setTextColor(0, 151, 167);
    doc.text('Workflow Phases', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    const phases = [
      'Pre-Arrival',
      'Arrived',
      'In Session',
      'Checking Out',
      'Checked Out',
      'Documentation',
      'Closed'
    ];
    
    const phaseStatus = workflow.workflow_status;
    const currentPhaseIndex = phases.map(p => p.toLowerCase().replace(' ', '-')).indexOf(phaseStatus);
    
    phases.forEach((phase, idx) => {
      const status = idx <= currentPhaseIndex ? '✓' : '○';
      doc.text(`${status} ${phase}`, 20, yPos + (idx * 6));
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`Generated by ${user.email} on ${new Date().toLocaleString()}`, 20, 280);
    }

    // Return PDF as blob
    const pdfBytes = doc.output('arraybuffer');
    
    // If saveToClient is true, upload to client's documents
    let documentUrl = null;
    if (saveToClient) {
      try {
        // Convert to blob and upload
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, `workflow_summary_${workflow.client_id}_${new Date().toISOString().split('T')[0]}.pdf`);
        
        // Use UploadFile integration
        const uploadResult = await base44.integrations.Core.UploadFile({ file: blob });
        documentUrl = uploadResult.file_url;
        
        // Create document record in PortalDocument entity
        await base44.entities.PortalDocument.create({
          client_id: workflow.client_id,
          name: `Workflow Summary - ${new Date().toLocaleDateString()}`,
          category: 'service_summary',
          description: `Appointment workflow summary generated on ${new Date().toLocaleDateString()}`,
          file_url: documentUrl,
          family_visible: true,
          document_type: 'other',
          uploaded_by: user.email,
          uploaded_date: new Date().toISOString(),
          language: 'both'
        });
      } catch (uploadError) {
        console.error('Error saving PDF to client documents:', uploadError);
        // Don't fail the whole request, just log the error
      }
    }
    
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="workflow_summary_${workflow.client_id}.pdf"`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});