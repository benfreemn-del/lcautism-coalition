import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Only admins can reset passwords' }, { status: 403 });
    }

    const { email, newPassword } = await req.json();

    if (!email || !newPassword) {
      return Response.json({ error: 'Email and new password are required' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Find user by email and reset password
    const users = await base44.asServiceRole.entities.User.filter({ email });
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUser = users[0];
    
    // Update password via the User entity's password field
    await base44.asServiceRole.entities.User.update(targetUser.id, { 
      password: newPassword 
    });

    return Response.json({
      success: true,
      message: `Password reset for ${email}`
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return Response.json({ 
      error: error.message || 'Error resetting password' 
    }, { status: 500 });
  }
});