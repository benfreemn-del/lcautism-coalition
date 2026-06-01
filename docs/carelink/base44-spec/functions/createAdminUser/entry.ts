import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const authUser = await base44.auth.me();
    
    // Only admins can create users
    if (authUser?.role !== 'admin') {
      return Response.json({ error: 'Only admins can create users' }, { status: 403 });
    }

    const { email, role = 'admin' } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Invite user (creates User record)
    await base44.users.inviteUser(email, role);

    return Response.json({
      success: true,
      message: `User ${email} created with role ${role}`,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return Response.json({ 
      error: error.message || 'Error creating user' 
    }, { status: 500 });
  }
});