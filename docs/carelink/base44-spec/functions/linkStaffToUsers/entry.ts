import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admins can link staff to users
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Only admins can link staff to users' }, { status: 403 });
    }

    const { staffId } = await req.json();

    if (!staffId) {
      return Response.json({ error: 'staffId is required' }, { status: 400 });
    }

    // Get the staff member
    const staff = await base44.entities.StaffMember.filter({ id: staffId });
    
    if (staff.length === 0) {
      return Response.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const staffMember = staff[0];

    // Find the corresponding user by email
    const users = await base44.asServiceRole.entities.User.filter({ email: staffMember.email });
    
    if (users.length === 0) {
      return Response.json({ error: `No user found for email ${staffMember.email}` }, { status: 404 });
    }

    const linkedUser = users[0];

    // Update staff member with user_id
    await base44.entities.StaffMember.update(staffId, {
      user_id: linkedUser.id,
    });

    return Response.json({
      success: true,
      message: `Linked ${staffMember.email} to user ${linkedUser.id}`,
      staff_id: staffId,
      user_id: linkedUser.id,
    });
  } catch (error) {
    console.error('Error linking staff to users:', error);
    return Response.json({ 
      error: error.message || 'Error linking staff to users' 
    }, { status: 500 });
  }
});