import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    const appointment = data;

    // Only proceed if appointment was just completed
    if (old_data?.status === 'Completed' || appointment.status !== 'Completed') {
      return Response.json({ skipped: true });
    }

    if (!appointment.client_id) {
      return Response.json({ error: 'No client_id in appointment' }, { status: 400 });
    }

    // Find follow-up tasks for this client that are pending
    const tasks = await base44.entities.Task.filter({
      client_id: appointment.client_id,
      status: 'Pending',
      category: 'Follow-up'
    });

    if (!tasks || tasks.length === 0) {
      return Response.json({ message: 'No follow-up tasks found' });
    }

    // Update the most recent follow-up task to complete
    const taskToComplete = tasks[0];
    await base44.entities.Task.update(taskToComplete.id, {
      status: 'Complete'
    });

    return Response.json({ success: true, task_id: taskToComplete.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});