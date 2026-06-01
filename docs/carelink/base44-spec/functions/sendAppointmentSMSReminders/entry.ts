import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { addHours, parseISO, format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return Response.json(
        { error: 'Twilio credentials not configured' },
        { status: 500 }
      );
    }

    // Get all scheduled appointments
    const appointments = await base44.entities.Appointment.filter({
      status: 'Scheduled',
      reminder_sent: false,
    }, '-appointment_date', 500);

    if (appointments.length === 0) {
      return Response.json({ reminders_sent: 0, message: 'No appointments need reminders' });
    }

    // Get all clients
    const clients = await base44.entities.Client.list();
    const clientMap = {};
    clients.forEach(c => {
      clientMap[c.id] = c;
    });

    const now = new Date();
    const tomorrow = addHours(now, 24);
    const reminderWindow = {
      start: addHours(now, 23.5),
      end: addHours(now, 24.5),
    };

    const reminders = [];
    const remindersSent = [];

    // Find appointments in the 24-hour reminder window
    for (const apt of appointments) {
      const aptDate = parseISO(apt.appointment_date);
      
      if (aptDate >= reminderWindow.start && aptDate <= reminderWindow.end) {
        const client = clientMap[apt.client_id];
        
        if (client && client.primary_phone) {
          reminders.push({
            appointmentId: apt.id,
            clientId: client.id,
            clientName: client.legal_first_name ? `${client.legal_first_name} ${client.legal_last_name}` : 'Client',
            clientPhone: client.primary_phone,
            appointmentTime: format(aptDate, 'h:mm a'),
            appointmentDate: format(aptDate, 'MMMM d, yyyy'),
            provider: apt.provider || 'your provider',
          });
        }
      }
    }

    // Send SMS reminders via Twilio
    for (const reminder of reminders) {
      try {
        const messageBody = `Hi ${reminder.clientName}, reminder: you have an appointment with ${reminder.provider} on ${reminder.appointmentDate} at ${reminder.appointmentTime}. Reply CONFIRM to confirm or CANCEL to cancel.`;
        
        const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + twilioAccountSid + '/Messages.json', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(twilioAccountSid + ':' + twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: twilioPhoneNumber,
            To: reminder.clientPhone,
            Body: messageBody,
          }).toString(),
        });

        if (response.ok) {
          // Mark appointment reminder as sent
          await base44.asServiceRole.entities.Appointment.update(reminder.appointmentId, {
            reminder_sent: true,
          });
          remindersSent.push(reminder.clientName);
        } else {
          console.error(`Failed to send SMS to ${reminder.clientPhone}:`, response.statusText);
        }
      } catch (error) {
        console.error(`Error sending SMS to ${reminder.clientPhone}:`, error.message);
      }
    }

    return Response.json({
      reminders_sent: remindersSent.length,
      clients: remindersSent,
      total_found: reminders.length,
      message: `SMS reminders sent to ${remindersSent.length} client(s)`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});