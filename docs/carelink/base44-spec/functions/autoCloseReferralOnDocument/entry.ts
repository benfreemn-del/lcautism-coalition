import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Triggered when a Client entity is updated.
// If a new document was added AND a linked referral is not yet closed, mark it Closed.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { data, old_data, changed_fields } = payload;

    // Only proceed if documents changed
    if (!changed_fields?.includes('documents')) {
      return Response.json({ skipped: 'documents not changed' });
    }

    const clientId = data?.id;
    if (!clientId) return Response.json({ skipped: 'no client id' });

    const oldDocs = old_data?.documents || [];
    const newDocs = data?.documents || [];

    // Only proceed if a document was actually added
    if (newDocs.length <= oldDocs.length) {
      return Response.json({ skipped: 'no new documents added' });
    }

    // Find open referrals for this client that are not already Closed/Declined/Transferred/Enrolled
    const allReferrals = await base44.asServiceRole.entities.Referral.filter({
      converted_client_id: clientId
    });

    const openReferrals = allReferrals.filter(r =>
      !['Closed', 'Declined', 'Transferred', 'Enrolled'].includes(r.status)
    );

    if (openReferrals.length === 0) {
      return Response.json({ skipped: 'no open referrals to close' });
    }

    // Close all open referrals for this client
    const updates = await Promise.all(
      openReferrals.map(r =>
        base44.asServiceRole.entities.Referral.update(r.id, {
          status: 'Closed',
          internal_notes: (r.internal_notes ? r.internal_notes + '\n' : '') +
            `[Auto-closed] Final document uploaded to client record on ${new Date().toLocaleDateString()}.`
        })
      )
    );

    return Response.json({ closed: updates.length, referralIds: openReferrals.map(r => r.id) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});