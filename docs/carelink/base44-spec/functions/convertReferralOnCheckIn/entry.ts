import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { event, data } = await req.json();

    // Only process on check-in
    if (!data?.check_in_time || event?.type !== 'update') {
      return Response.json({ success: true });
    }

    // If appointment has referral_id, mark referral as Converted
    if (data?.referral_id) {
      await base44.asServiceRole.entities.Referral.update(data.referral_id, {
        status: 'Converted',
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error converting referral on check-in:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});