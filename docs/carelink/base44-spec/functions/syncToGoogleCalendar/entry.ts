import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId, title, description, startDateTime, endDateTime } = await req.json();

    if (!title || !startDateTime) {
      return Response.json({ error: 'Title and start date required' }, { status: 400 });
    }

    // Get Google Calendar access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    // Create event in Google Calendar
    const event = {
      summary: title,
      description: description || '',
      start: { dateTime: new Date(startDateTime).toISOString() },
      end: { dateTime: new Date(endDateTime || new Date(new Date(startDateTime).getTime() + 3600000)).toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
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
    return Response.json({
      success: true,
      eventId: calendarEvent.id,
      eventLink: calendarEvent.htmlLink,
    });
  } catch (error) {
    console.error('Error syncing to Google Calendar:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});