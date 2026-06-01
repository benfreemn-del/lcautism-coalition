import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    // Only process on check-in (check_in_time changes from null to a value)
    if (!data.check_in_time || old_data?.check_in_time) {
      return Response.json({ status: 'skipped', reason: 'not_a_checkin' });
    }

    const appointment = data;
    const clientName = appointment.client_name || 'Client';
    const provider = appointment.provider;
    const appointmentTitle = appointment.title || 'Appointment';

    if (!provider) {
      return Response.json({ status: 'skipped', reason: 'no_provider' });
    }

    // Create notification record
    const notification = await base44.asServiceRole.entities.Notification.create({
      title: `✓ ${clientName} checked in`,
      message: `${clientName} just checked in for ${appointmentTitle}`,
      type: 'check_in',
      recipient: provider,
      related_appointment_id: appointment.id,
      related_client_id: appointment.client_id,
      is_read: false,
      created_at: new Date().toISOString(),
      priority: 'high'
    });

    return Response.json({
      status: 'success',
      notification_id: notification.id,
      message: `Notification sent to ${provider} about ${clientName} check-in`
    });
  } catch (error) {
    console.error('Error sending check-in notification:', error);
    return Response.json(
      { error: error.message, status: 'error' },
      { status: 500 }
    );
  }
});