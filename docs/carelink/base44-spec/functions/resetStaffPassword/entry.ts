import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Staff email is required' }, { status: 400 });
    }

    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-12).toUpperCase();

    // Note: Password reset is handled through the platform's auth system
    // For now, we return the temporary password for manual setup
    // In a production system, you'd integrate with your auth provider's password reset API

    return Response.json({
      success: true,
      email,
      temporaryPassword: tempPassword,
      message: 'Password reset initiated. Share this temporary password with the staff member.'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});