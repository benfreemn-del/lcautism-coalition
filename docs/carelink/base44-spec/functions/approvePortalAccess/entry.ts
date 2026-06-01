import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { accessId, approved, visibleFields, notes } = await req.json();

    // Get access record
    const accesses = await base44.asServiceRole.entities.PortalAccess.filter({ id: accessId });
    if (!accesses.length) {
      return Response.json({ error: 'Access record not found' }, { status: 404 });
    }

    const access = accesses[0];

    // Update access
    await base44.asServiceRole.entities.PortalAccess.update(accessId, {
      approved,
      approved_by: user.email,
      approved_date: new Date().toISOString(),
      status: approved ? 'active' : 'suspended',
      visible_fields: visibleFields || access.visible_fields,
      notes,
    });

    // Get portal user to send notification
    const portalUsers = await base44.asServiceRole.entities.PortalUser.filter({
      id: access.portal_user_id,
    });

    if (portalUsers.length > 0) {
      const portalUser = portalUsers[0];

      // Send email notification
      await base44.integrations.Core.SendEmail({
        to: portalUser.email,
        subject: approved
          ? 'Your Portal Access Has Been Approved'
          : 'Portal Access Request Status Update',
        body: approved
          ? `<p>Your access to the Family Portal has been approved. You can now log in and view your child's information.</p>`
          : `<p>Your portal access request could not be approved at this time. Please contact your coordinator for more information.</p>`,
      });
    }

    return Response.json({
      success: true,
      message: approved ? 'Access approved' : 'Access denied',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});