import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check for valid OnboardingRequest
    const onboardingRequests = await base44.asServiceRole.entities.OnboardingRequest.filter({
      email: email,
    });

    if (onboardingRequests.length === 0) {
      return Response.json({
        valid: false,
        message: 'No invitation found for this email address.',
      }, { status: 403 });
    }

    const request = onboardingRequests[0];

    if (request.status === 'Rejected') {
      return Response.json({
        valid: false,
        message: 'Your invitation has been rejected.',
      }, { status: 403 });
    }

    // Check if invitation is expired or still pending
    if (request.status === 'Pending Approval') {
      return Response.json({
        valid: false,
        message: 'Your invitation is still pending admin approval.',
      }, { status: 403 });
    }

    // Invitation is valid (Approved or Completed)
    return Response.json({
      valid: true,
      message: 'Invitation is valid',
    }, { status: 200 });

  } catch (error) {
    return Response.json({
      error: error.message,
    }, { status: 500 });
  }
});