import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { distributionId } = await req.json();

    if (!distributionId) {
      return Response.json({ error: 'Distribution ID required' }, { status: 400 });
    }

    // Fetch the form distribution
    const distribution = await base44.entities.FormDistribution.get(distributionId);
    if (!distribution) {
      return Response.json({ error: 'Distribution not found' }, { status: 404 });
    }

    // Get Google Calendar access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    // Create event in Google Calendar
    const event = {
      summary: `📋 ${distribution.form_title} Due - ${distribution.client_name}`,
      description: `Form submission deadline for ${distribution.client_name}.\nForm Type: ${distribution.form_type}\nClient Email: ${distribution.client_email}`,
      start: { dateTime: new Date(distribution.expiration_date).toISOString() },
      end: { dateTime: new Date(new Date(distribution.expiration_date).getTime() + 3600000).toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 48 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Google Calendar API error:', error);
      return Response.json({ error: 'Failed to create calendar event' }, { status: 500 });
    }

    const calendarEvent = await response.json();
    
    // Store calendar event ID in distribution for future updates/deletes
    await base44.entities.FormDistribution.update(distributionId, {
      calendar_event_id: calendarEvent.id,
    });

    return Response.json({
      success: true,
      eventId: calendarEvent.id,
      eventLink: calendarEvent.htmlLink,
    });
  } catch (error) {
    console.error('Error syncing form due date:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});