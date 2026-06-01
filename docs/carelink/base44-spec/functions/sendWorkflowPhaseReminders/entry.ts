import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // This is a scheduled function, so we don't need user auth
    // But we should verify it's being called by the system
    
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find workflows stuck in documentation phase for more than 24 hours
    const allWorkflows = await base44.entities.ClientWorkflow.list();
    
    const workflowsNeedingReminder = allWorkflows.filter(w => {
      if (w.workflow_status !== 'documentation-pending') return false;
      
      const lastUpdated = new Date(w.last_updated || w.created_date);
      const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
      
      return hoursSinceUpdate >= 24;
    });

    let reminderCount = 0;

    for (const workflow of workflowsNeedingReminder) {
      try {
        // Get client details
        const client = await base44.entities.Client.get(workflow.client_id);
        
        // Find assigned staff
        const staffMembers = await base44.entities.StaffMember.list();
        const assignedStaff = staffMembers.find(s => 
          s.caseload_assignments?.includes(workflow.client_id) ||
          s.email === workflow.last_updated_by
        );

        if (!assignedStaff) continue;

        // Send reminder
        await base44.integrations.Core.SendEmail({
          to: assignedStaff.email,
          subject: 'Recordatorio: Documentación Pendiente / Documentation Reminder',
          body: `
            Estimado ${assignedStaff.name},
            
            La documentación para ${client?.legal_first_name || client?.legal_last_name || workflow.client_name} está pendiente desde hace más de 24 horas.
            
            Por favor complete:
            - Notas de la visita
            - Plan de servicio actualizado
            - Referencias ejecutadas
            - Retroalimentación familiar capturada
            
            ID del Flujo de Trabajo: ${workflow.id}
            Estado Actual: ${workflow.workflow_status}
            Última Actualización: ${new Date(workflow.last_updated).toLocaleString()}
            
            ---
            
            Dear ${assignedStaff.name},
            
            Documentation for ${client?.legal_first_name || client?.legal_last_name || workflow.client_name} has been pending for over 24 hours.
            
            Please complete:
            - Visit notes
            - Updated service plan
            - Executed referrals
            - Captured family feedback
            
            Workflow ID: ${workflow.id}
            Current Status: ${workflow.workflow_status}
            Last Updated: ${new Date(workflow.last_updated).toLocaleString()}
          `
        });

        reminderCount++;
        console.log(`Sent reminder to ${assignedStaff.email} for client ${workflow.client_id}`);
      } catch (error) {
        console.error(`Failed to send reminder for workflow ${workflow.id}:`, error);
      }
    }

    return Response.json({ 
      success: true, 
      message: `Sent ${reminderCount} workflow reminders`,
      workflowsProcessed: workflowsNeedingReminder.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});