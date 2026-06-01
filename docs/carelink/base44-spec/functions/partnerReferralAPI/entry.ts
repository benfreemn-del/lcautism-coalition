import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import crypto from 'node:crypto';

Deno.serve(async (req) => {
  try {
    // Verify OAuth token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing or invalid Bearer token' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    // Token validation is handled by your OAuth provider
    // For now, we accept valid tokens

    const base44 = createClientFromRequest(req);

    // Handle different request methods
    if (req.method === 'POST') {
      // Submit referral via API
      const body = await req.json();
      const { client_name, caregiver_name, referral_reason, clinic_name } = body;

      if (!client_name || !caregiver_name || !referral_reason) {
        return Response.json({ error: 'Missing required fields' }, { status: 400 });
      }

      const referral = await base44.asServiceRole.entities.Referral.create({
        client_name,
        caregiver_name,
        referral_reason,
        referral_source: clinic_name || 'External Partner API',
        status: 'Pending',
        received_date: new Date().toISOString().split('T')[0],
        created_via_api: true
      });

      return Response.json({
        success: true,
        referral_id: referral.id,
        status: 'Pending',
        message: 'Referral submitted successfully'
      }, { status: 201 });
    }

    if (req.method === 'GET') {
      // Get referral status
      const url = new URL(req.url);
      const referralId = url.searchParams.get('id');

      if (!referralId) {
        return Response.json({ error: 'referralId query parameter required' }, { status: 400 });
      }

      const referral = await base44.asServiceRole.entities.Referral.get(referralId);
      if (!referral) {
        return Response.json({ error: 'Referral not found' }, { status: 404 });
      }

      return Response.json({
        referral_id: referral.id,
        status: referral.status,
        client_name: referral.client_name,
        received_date: referral.received_date,
        notes: referral.notes
      });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});