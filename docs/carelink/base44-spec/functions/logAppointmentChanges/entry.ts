import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    const { event, data, old_data } = payload;
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let action = '';
    let details = '';
    let changes = [];

    if (event.type === 'create') {
      action = 'Appointment Created';
      details = `New appointment created for ${data.client_name}: ${data.title}`;
    } else if (event.type === 'update') {
      action = 'Appointment Updated';
      const changeList = [];
      
      if (old_data.appointment_date !== data.appointment_date) {
        changeList.push(`Rescheduled from ${old_data.appointment_date} to ${data.appointment_date}`);
      }
      if (old_data.status !== data.status) {
        changeList.push(`Status changed from ${old_data.status} to ${data.status}`);
      }
      if (old_data.provider !== data.provider) {
        changeList.push(`Provider changed from ${old_data.provider} to ${data.provider}`);
      }
      if (old_data.location !== data.location) {
        changeList.push(`Location changed from ${old_data.location} to ${data.location}`);
      }
      
      changes = changeList;
      details = changeList.length > 0 ? changeList.join('; ') : 'Appointment details updated';
    } else if (event.type === 'delete') {
      action = 'Appointment Cancelled';
      details = `Appointment cancelled for ${data.client_name}: ${data.title}`;
    }

    // Create audit log entry
    await base44.asServiceRole.entities.AuditLog.create({
      staff_id: user.id,
      staff_name: user.full_name,
      action_type: action,
      action_timestamp: new Date().toISOString(),
      actor: user.email,
      record_accessed: `Appointment: ${data.id} (${data.client_name})`,
      justification: details,
      hipaa_compliant: true,
      status: 'Completed'
    });

    return Response.json({
      success: true,
      action,
      details
    });
  } catch (error) {
    console.error('Audit log error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});