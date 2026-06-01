import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admins can invite staff
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Only admins can invite staff members' }, { status: 403 });
    }

    const { email, role = 'user', name = '', staffRole = 'Administrative Support' } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate role is either 'user' or 'admin'
    if (!['user', 'admin'].includes(role)) {
      return Response.json({ error: 'Role must be either "user" or "admin"' }, { status: 400 });
    }

    // Send the invite
    await base44.users.inviteUser(email, role);

    // Send welcome email
    const welcomeEmailContent = `
Dear ${name || 'Team Member'},

Welcome to our organization! Your account has been created and you're invited to join our staff platform.

You'll be able to:
• Manage your schedule and appointments
• Access client information securely
• Collaborate with your team
• Track your training and compliance requirements

Please log in to get started and complete your onboarding.

If you have any questions, please reach out to your administrator.

Best regards,
Administration Team
    `.trim();

    await base44.integrations.Core.SendEmail({
      to: email,
      subject: 'Welcome to Our Staff Platform',
      body: welcomeEmailContent,
      from_name: 'Administration'
    }).catch(err => console.error('Email send failed:', err));

    // Find the created user to get their ID
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const userId = users.length > 0 ? users[0].id : null;

    // Create or update StaffMember record
    const existingStaff = await base44.entities.StaffMember.filter({ email });
    
    if (existingStaff.length > 0) {
      // Update existing staff member
      await base44.entities.StaffMember.update(existingStaff[0].id, {
        status: 'Pending Onboarding',
        email,
        role: [staffRole],
        user_id: userId,
      });
    } else {
      // Create new staff member record
      await base44.entities.StaffMember.create({
        name: name || email.split('@')[0],
        email,
        role: [staffRole],
        status: 'Pending Onboarding',
        hire_date: new Date().toISOString().split('T')[0],
        user_id: userId,
      });
    }

    return Response.json({
      success: true,
      message: `Invitation sent to ${email}`,
      email,
      role,
    });
  } catch (error) {
    console.error('Error inviting staff:', error);
    return Response.json({ 
      error: error.message || 'Error sending invitation' 
    }, { status: 500 });
  }
});