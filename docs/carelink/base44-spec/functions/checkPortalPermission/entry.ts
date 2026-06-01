import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, dataType } = await req.json();

    if (!clientId) {
      return Response.json({ error: 'clientId required' }, { status: 400 });
    }

    // Check if portal user has active access to this client
    const accessRecords = await base44.asServiceRole.entities.PortalAccess.filter({
      portal_user_id: user.id,
      client_id: clientId,
      status: 'active',
    });

    if (!accessRecords.length) {
      return Response.json({ permitted: false }, { status: 403 });
    }

    const access = accessRecords[0];

    // Check if specific data type is in visible_fields
    const visibleFields = access.visible_fields || [];
    const isDataTypeVisible = !dataType || visibleFields.includes(dataType) || visibleFields.length === 0;

    return Response.json({
      permitted: true,
      access: {
        permissionLevel: access.permission_level,
        visibleFields: visibleFields,
        canUpload: access.permission_level === 'view_and_upload' || access.permission_level === 'view_upload_and_message',
        canMessage: access.permission_level === 'view_upload_and_message',
      },
      dataTypeVisible: isDataTypeVisible,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});