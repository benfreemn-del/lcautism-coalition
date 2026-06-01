import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email, staffId } = await req.json();

    if (!email || !staffId) {
      return Response.json({ error: 'Email and staffId are required' }, { status: 400 });
    }

    // Verify staff exists
    const staff = await base44.entities.StaffMember.filter({ id: staffId });
    if (!staff || staff.length === 0) {
      return Response.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Find the user by email
    const users = await base44.entities.User.filter({ email });
    if (users.length === 0) {
      return Response.json({ error: `User with email ${email} not found` }, { status: 404 });
    }

    const foundUser = users[0];

    // Update the StaffMember record with the user_id
    await base44.entities.StaffMember.update(staffId, {
      user_id: foundUser.id
    });

    return Response.json({ 
      success: true,
      userId: foundUser.id,
      message: `Linked staff to user ${email}`
    });
  } catch (error) {
    console.error('autoLinkStaffToUser error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});