import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    const appointment = data;
    if (!appointment || !appointment.provider || !appointment.client_name) {
      return Response.json({ error: 'Invalid appointment data' }, { status: 400 });
    }

    // Find the staff member by name or email
    const staff = await base44.entities.StaffMember.filter({
      $or: [
        { name: appointment.provider },
        { email: appointment.provider }
      ]
    });

    if (!staff || staff.length === 0) {
      return Response.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const staffMember = staff[0];

    // Calculate due date (3 days after appointment)
    const appointmentDate = new Date(appointment.appointment_date);
    const dueDate = new Date(appointmentDate.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Create follow-up task
    const task = await base44.entities.Task.create({
      title: `Follow-up: ${appointment.client_name}`,
      description: `Follow-up for appointment on ${appointmentDate.toLocaleDateString()}. Type: ${appointment.appointment_type}`,
      category: 'Follow-up',
      status: 'Pending',
      priority: 'Medium',
      due_date: dueDate.toISOString().split('T')[0],
      client_id: appointment.client_id,
      client_name: appointment.client_name,
      staff_member_id: staffMember.id,
      assigned_to: staffMember.email || staffMember.name
    });

    return Response.json({ success: true, task_id: task.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});