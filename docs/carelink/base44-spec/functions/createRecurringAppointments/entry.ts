import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { addDays, addWeeks, addMonths, parseISO, format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { appointmentId, appointmentData } = await req.json();
    
    if (!appointmentData.is_recurring || !appointmentData.recurrence_pattern || !appointmentData.recurrence_end_date) {
      return Response.json({ error: 'Invalid recurring appointment data' }, { status: 400 });
    }

    const startDate = parseISO(appointmentData.appointment_date);
    const endDate = parseISO(appointmentData.recurrence_end_date);
    const createdAppointments = [];
    
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const appointmentToCreate = {
        ...appointmentData,
        appointment_date: currentDate.toISOString(),
        end_time: addMinutes(currentDate, appointmentData.duration_minutes || 60).toISOString(),
        parent_appointment_id: appointmentId,
        is_recurring: false,
        recurrence_pattern: null,
        recurrence_end_date: null,
      };

      const created = await base44.entities.Appointment.create(appointmentToCreate);
      createdAppointments.push(created);

      // Calculate next occurrence
      if (appointmentData.recurrence_pattern === 'weekly') {
        currentDate = addWeeks(currentDate, 1);
      } else if (appointmentData.recurrence_pattern === 'bi-weekly') {
        currentDate = addWeeks(currentDate, 2);
      } else if (appointmentData.recurrence_pattern === 'monthly') {
        currentDate = addMonths(currentDate, 1);
      }
    }

    return Response.json({ 
      success: true, 
      appointmentsCreated: createdAppointments.length,
      appointments: createdAppointments 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}