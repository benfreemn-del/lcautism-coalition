import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email, clientId, role, relationship, customMessage } = await req.json();

    // Generate secure token
    const token = crypto.getRandomValues(new Uint8Array(32)).toString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Create invitation
    const invitation = await base44.asServiceRole.entities.PortalInvitation.create({
      email,
      client_id: clientId,
      role,
      relationship_to_child: relationship,
      token,
      expires_at: expiresAt,
      invited_by: user.email,
      invited_date: new Date().toISOString(),
      status: 'pending',
      message: customMessage,
    });

    // Send bilingual email
    const registrationLink = `${Deno.env.get('APP_URL')}/portal/register?token=${token}`;
    
    const emailContent = {
      en: `
        <h2>Welcome to the Family Portal</h2>
        <p>You've been invited to connect with LCAC through our Family Portal.</p>
        <p><a href="${registrationLink}">Click here to create your account</a> (Link expires in 30 days)</p>
        <p>The Family Portal is a secure space where you can:</p>
        <ul>
          <li>View your child's appointments and progress</li>
          <li>Send and receive messages with your coordinator</li>
          <li>Sign important documents</li>
          <li>Access resources and support</li>
        </ul>
      `,
      es: `
        <h2>Bienvenido al Portal Familiar</h2>
        <p>Ha sido invitado a conectarse con LCAC a través de nuestro Portal Familiar.</p>
        <p><a href="${registrationLink}">Haga clic aquí para crear su cuenta</a> (El enlace expira en 30 días)</p>
        <p>El Portal Familiar es un espacio seguro donde puede:</p>
        <ul>
          <li>Ver las citas y el progreso de su hijo</li>
          <li>Enviar y recibir mensajes con su coordinador</li>
          <li>Firmar documentos importantes</li>
          <li>Acceder a recursos y apoyo</li>
        </ul>
      `,
    };

    await base44.integrations.Core.SendEmail({
      to: email,
      subject: 'Invitation to LCAC Family Portal',
      body: emailContent.en,
    });

    return Response.json({
      success: true,
      invitation: invitation,
      registrationLink,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});