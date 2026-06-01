import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin required' }, { status: 403 });
    }

    const { workflowId, reminderType } = await req.json();

    if (!workflowId) {
      return Response.json({ error: 'Missing workflow ID' }, { status: 400 });
    }

    const workflow = await base44.entities.ClientWorkflow.get(workflowId);
    
    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Get client details
    const client = await base44.entities.Client.get(workflow.client_id);
    
    let reminderMessage = '';
    let subject = '';

    switch (reminderType) {
      case 'pre-arrival':
        subject = 'Recordatorio: Próxima Cita / Appointment Reminder';
        reminderMessage = `
          Hola ${client?.legal_first_name || client?.preferred_name},
          
          Esto es un recordatorio de su próxima cita en el Centro Comunitario Spectrum y de Desarrollo.
          
          Hello ${client?.legal_first_name || client?.preferred_name},
          
          This is a reminder of your upcoming appointment at the Spectrum and Development Community Center.
          
          Por favor llegue 10 minutos antes de su hora programada.
          Please arrive 10 minutes before your scheduled time.
          
          Si necesita cancelar o reprogramar, por favor contáctenos.
          If you need to cancel or reschedule, please contact us.
        `;
        break;

      case 'documentation-pending':
        subject = 'Recordatorio: Documentación Pendiente / Documentation Reminder';
        reminderMessage = `
          Estimado miembro del equipo,
          
          La documentación para ${client?.legal_first_name || client?.legal_last_name} está pendiente.
          Por favor complete las notas de la visita y cualquier formulario requerido.
          
          Team member,
          
          Documentation for ${client?.legal_first_name || client?.legal_last_name} is pending.
          Please complete visit notes and any required forms.
          
          ID del Flujo de Trabajo: ${workflowId}
          Workflow ID: ${workflowId}
        `;
        break;

      case 'follow-up':
        subject = 'Seguimiento Requerido / Follow-up Required';
        reminderMessage = `
          Estimado miembro del equipo,
          
          Se requiere seguimiento para ${client?.legal_first_name || client?.legal_last_name}.
          
          Team member,
          
          Follow-up is required for ${client?.legal_first_name || client?.legal_last_name}.
          
          Por favor revise el plan de servicio para los próximos pasos.
          Please review the service plan for next steps.
        `;
        break;

      default:
        return Response.json({ error: 'Invalid reminder type' }, { status: 400 });
    }

    // Send email reminder
    try {
      await base44.integrations.Core.SendEmail({
        to: client?.email || user.email,
        subject: subject,
        body: reminderMessage
      });

      return Response.json({ 
        success: true, 
        message: 'Reminder sent successfully',
        reminderType,
        recipient: client?.email || user.email
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      return Response.json({ 
        success: false, 
        error: 'Failed to send email reminder',
        details: emailError.message
      }, { status: 500 });
    }

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});