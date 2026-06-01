import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workflowId, newPhase, phaseData } = await req.json();

    if (!workflowId || !newPhase) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate phase transition
    const validPhases = [
      'pre-arrival', 'arrived', 'in-session', 'checking-out', 
      'checked-out', 'documentation-pending', 'closed'
    ];
    
    if (!validPhases.includes(newPhase)) {
      return Response.json({ error: 'Invalid phase' }, { status: 400 });
    }

    // Get current workflow
    const workflow = await base44.entities.ClientWorkflow.get(workflowId);
    
    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Update workflow with new phase
    const updateData = {
      workflow_status: newPhase,
      last_updated: new Date().toISOString(),
      last_updated_by: user.email,
      ...phaseData
    };

    // Add timestamp for specific phases
    if (newPhase === 'arrived') {
      updateData.phase_data = {
        ...workflow.phase_data,
        arrival: {
          ...workflow.phase_data?.arrival,
          arrival_timestamp: new Date().toISOString()
        }
      };
    }

    if (newPhase === 'checked-out') {
      updateData.phase_data = {
        ...workflow.phase_data,
        check_out: {
          ...workflow.phase_data?.check_out,
          departure_timestamp: new Date().toISOString()
        }
      };
    }

    await base44.entities.ClientWorkflow.update(workflowId, updateData);

    // Trigger notifications based on phase
    if (newPhase === 'checked-out') {
      // Send check-out notification to provider
      try {
        await base44.functions.invoke('sendCheckInNotificationToProvider', {
          appointmentId: workflow.appointment_id,
          clientId: workflow.client_id,
          notificationType: 'check-out'
        });
      } catch (e) {
        console.error('Failed to send notification:', e);
      }
    }

    return Response.json({ 
      success: true, 
      workflowId, 
      newPhase,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});