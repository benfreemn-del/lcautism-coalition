import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, clientName, clientEmail, formType, formTitle } = await req.json();

    if (!clientId || !clientEmail || !formType) {
      return Response.json(
        { error: 'Missing required fields: clientId, clientEmail, formType' },
        { status: 400 }
      );
    }

    // Generate unique access link
    const accessToken = crypto.randomUUID();
    const accessLink = `${Deno.env.get('APP_URL') || 'https://app.lcacconnect.org'}/portal/form/${accessToken}`;

    // Create FormDistribution record
    const distribution = await base44.entities.FormDistribution.create({
      client_id: clientId,
      client_name: clientName,
      client_email: clientEmail,
      form_type: formType,
      form_title: formTitle,
      sent_by: user.email,
      sent_date: new Date().toISOString().split('T')[0],
      sent_via_email: true,
      access_link: accessLink,
      expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });

    // Send email with form link using Resend
    const emailSubject = `Complete Your ${formTitle} - LCAC Connect`;
    const emailBody = `Hello ${clientName},\n\nWe'd like you to complete the following form: ${formTitle}\n\nPlease click the link below to access and fill out the form:\n${accessLink}\n\nThis link will expire in 30 days.\n\nIf you have any questions or need assistance, please reach out to us.\n\nBest regards,\nLewis County Autism Coalition Team`;

    const emailResponse = await resend.emails.send({
      from: 'noreply@lcacconnect.org',
      to: clientEmail,
      subject: emailSubject,
      text: emailBody,
    });

    if (emailResponse.error) {
      throw new Error(`Resend API error: ${emailResponse.error.message}`);
    }

    return Response.json({
      success: true,
      distribution_id: distribution.id,
      message: `Form sent to ${clientEmail}`,
      access_link: accessLink
    });
  } catch (error) {
    console.error('Error sending form:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});