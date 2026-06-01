import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { portal_user_id, client_id } = await req.json();

    if (!portal_user_id || !client_id) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Auto-approve access for admin-initiated requests
    const access = await base44.entities.PortalAccess.create({
      portal_user_id,
      client_id,
      status: 'active',
      approved: true,
      approved_by: user.email,
      approved_date: new Date().toISOString(),
      permission_level: 'view_upload_and_message',
      visible_fields: ['appointments', 'messages', 'goals_summary', 'documents_pending', 'clinical_notes', 'service_plan'],
      notes: 'Auto-approved by admin'
    });

    return Response.json({ success: true, access_id: access.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});