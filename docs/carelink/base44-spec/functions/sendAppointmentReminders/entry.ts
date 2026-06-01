import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all appointments
    const appointments = await base44.asServiceRole.entities.Appointment.list('-appointment_date', 1000);
    
    const now = new Date();
    const reminderWindow = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const lookAheadTime = 30 * 60 * 1000; // 30 minute window to check

    let remindersSent = 0;
    const errors = [];

    for (const apt of appointments) {
      // Skip if reminder already sent
      if (apt.reminder_sent) continue;
      
      // Skip if not scheduled status
      if (apt.status !== 'Scheduled') continue;

      const aptTime = new Date(apt.appointment_date).getTime();
      const timeDiff = aptTime - now.getTime();

      // Check if appointment is within 24 hours (with 30-min window)
      if (timeDiff > reminderWindow - lookAheadTime && timeDiff < reminderWindow + lookAheadTime) {
        try {
          // Get client details
          const client = await base44.asServiceRole.entities.Client.get(apt.client_id);
          
          if (!client || !client.email) {
            errors.push(`No email for client ${apt.client_id}`);
            continue;
          }

          // Send reminder email
          const appointmentTime = new Date(apt.appointment_date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          });

          await base44.asServiceRole.integrations.Core.SendEmail({
            to: client.email,
            subject: `Appointment Reminder: ${apt.title} on ${appointmentTime}`,
            body: `Hello ${client.preferred_name || client.legal_first_name},\n\nThis is a reminder that you have an appointment scheduled in 24 hours.\n\nAppointment Details:\nTitle: ${apt.title}\nDate & Time: ${appointmentTime}\nProvider: ${apt.provider}\nLocation: ${apt.location || 'To be confirmed'}\n\nIf you need to reschedule or cancel, please contact us as soon as possible.\n\nThank you!`
          });

          // Mark reminder as sent
          await base44.asServiceRole.entities.Appointment.update(apt.id, {
            reminder_sent: true
          });

          remindersSent++;
        } catch (error) {
          errors.push(`Error for appointment ${apt.id}: ${error.message}`);
        }
      }
    }

    return Response.json({
      success: true,
      remindersSent,
      errors: errors.length > 0 ? errors : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Appointment reminder error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});