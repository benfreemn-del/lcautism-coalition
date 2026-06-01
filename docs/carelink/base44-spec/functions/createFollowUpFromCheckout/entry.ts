import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { appointmentData, followUpData } = await req.json();
    
    // Create follow-up task if needed
    if (followUpData?.follow_up_needed) {
      const task = {
        title: `Follow-up: ${appointmentData.client_name}`,
        description: followUpData.follow_up_notes || `Follow-up needed for ${appointmentData.client_name}`,
        status: 'Pending',
        priority: 'Medium',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
        assigned_to: followUpData.check_out_provider || user.email,
        client_id: appointmentData.client_id,
        client_name: appointmentData.client_name,
        category: 'Follow-up',
      };
      
      await base44.entities.Task.create(task);
    }
    
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});