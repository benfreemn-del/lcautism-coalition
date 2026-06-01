import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email, role } = await req.json();

    // Find user by email first
    const users = await base44.asServiceRole.entities.User.filter({ email });
    
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user role via service role
    const userId = users[0].id;
    await base44.asServiceRole.entities.User.update(userId, { role });
    
    return Response.json({ success: true, message: `User ${email} role set to ${role}` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});