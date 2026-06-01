import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { client_id, clinical_note_id, note_data } = await req.json();

    if (!client_id || !clinical_note_id) {
      return Response.json({ error: 'Missing client_id or clinical_note_id' }, { status: 400 });
    }

    // Fetch the client
    const client = await base44.entities.Client.get(client_id);
    if (!client) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    // Add note to client's staff_notes array if it doesn't exist
    const noteEntry = {
      id: clinical_note_id,
      author: user.full_name || user.email,
      email: user.email,
      content: `[${note_data.note_type}] ${note_data.session_date} - ${note_data.intervention?.substring(0, 100) || 'Clinical note'}...`,
      category: 'Progress Update',
      timestamp: new Date().toISOString(),
    };

    const updatedNotes = client.staff_notes || [];
    updatedNotes.unshift(noteEntry);

    // Update client record with the new note
    await base44.entities.Client.update(client_id, {
      staff_notes: updatedNotes.slice(0, 100), // Keep last 100 notes
    });

    return Response.json({ success: true, message: 'Note linked to client record' });
  } catch (error) {
    console.error('Error linking note:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});