import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { distributionId } = await req.json();

    if (!distributionId) {
      return Response.json(
        { error: 'Missing required field: distributionId' },
        { status: 400 }
      );
    }

    // Fetch the form distribution record
    const distributions = await base44.entities.FormDistribution.filter({
      id: distributionId
    });

    if (!distributions || distributions.length === 0) {
      return Response.json({ error: 'Form distribution not found' }, { status: 404 });
    }

    const distribution = distributions[0];

    // Check if already completed
    if (distribution.completion_status === 'completed') {
      return Response.json(
        { error: 'Form already completed' },
        { status: 400 }
      );
    }

    // Send reminder email
    const emailSubject = `Reminder: Please Complete Your ${distribution.form_title}`;
    const emailBody = `
Hello ${distribution.client_name},

This is a friendly reminder to complete your ${distribution.form_title}.

Click the link below to access the form:
${distribution.access_link}

This link expires on ${distribution.expiration_date}.

If you have any questions, please contact us.

Best regards,
Lewis County Autism Coalition Team
    `;

    await base44.integrations.Core.SendEmail({
      to: distribution.client_email,
      subject: emailSubject,
      body: emailBody,
      from_name: 'LCAC Connect'
    });

    // Update reminder tracking
    await base44.entities.FormDistribution.update(distributionId, {
      reminder_sent: true,
      reminder_sent_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      message: `Reminder sent to ${distribution.client_email}`
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});