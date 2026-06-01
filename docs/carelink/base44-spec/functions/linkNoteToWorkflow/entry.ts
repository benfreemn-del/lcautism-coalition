import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clinical_note_id, appointment_id, note_data } = await req.json();

    if (!clinical_note_id || !appointment_id) {
      return Response.json({ error: 'Missing clinical_note_id or appointment_id' }, { status: 400 });
    }

    // Fetch the workflow
    const workflows = await base44.entities.ClientWorkflow.filter({ appointment_id });
    const workflow = workflows[0];

    if (!workflow) {
      return Response.json({ error: 'Workflow not found for this appointment' }, { status: 404 });
    }

    // Update workflow with visit note and service plan data
    const visitNote = {
      time_start: note_data.start_time,
      time_end: note_data.end_time,
      location: note_data.location,
      participants: note_data.participants || [],
      activities: note_data.note_body || note_data.intervention,
      family_voice: note_data.outcome,
      plan: note_data.follow_up_plan,
      next_steps: note_data.follow_up_plan,
      time_spent_minutes: note_data.duration_minutes,
      template_used: note_data.note_type,
      clinical_note_id: clinical_note_id
    };

    const servicePlan = {
      goals: [],
      referrals: [],
      family_priorities: [],
      next_steps: note_data.follow_up_plan ? [note_data.follow_up_plan] : [],
      barriers: '',
      strengths: note_data.outcome
    };

    // Update workflow with comprehensive data
    await base44.entities.ClientWorkflow.update(workflow.id, {
      visit_note: visitNote,
      service_plan: servicePlan,
      phase_data: {
        ...workflow.phase_data,
        active_session: {
          ...(workflow.phase_data?.active_session || {}),
          activities_conducted: note_data.note_body ? [note_data.note_body] : [],
          service_plan_updated: true,
          note_linked: true
        },
        post_visit: {
          ...(workflow.phase_data?.post_visit || {}),
          note_finalized: true,
          note_finalized_timestamp: new Date().toISOString()
        }
      },
      last_updated: new Date().toISOString(),
      last_updated_by: user.email
    });

    return Response.json({ 
      success: true, 
      message: 'Note linked to workflow and visit summary saved',
      workflow_id: workflow.id
    });
  } catch (error) {
    console.error('Error linking note to workflow:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});