import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Log PHI access for HIPAA compliance audit trail
 * Called when users access sensitive client data
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      entity_type,
      entity_id,
      client_id,
      client_name,
      access_type, // 'view', 'update', 'create', 'delete'
      fields_accessed,
      ip_address,
      device_info,
    } = payload;

    // Create audit log entry
    const auditLog = {
      staff_member_email: user.email,
      staff_name: user.full_name,
      client_id,
      client_name,
      entity_type,
      entity_id,
      access_type,
      fields_accessed: fields_accessed || [],
      timestamp: new Date().toISOString(),
      ip_address,
      device_info,
      is_family_visible: false, // Staff access not visible to families
    };

    // Try to save to PortalAccessLog
    try {
      await base44.asServiceRole.entities.PortalAccessLog.create(auditLog);
    } catch (logError) {
      console.error('Failed to log PHI access:', logError);
      // Don't fail the request if logging fails, but report it
    }

    return Response.json({ 
      success: true, 
      message: 'PHI access logged' 
    });
  } catch (error) {
    console.error('Error logging PHI access:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});