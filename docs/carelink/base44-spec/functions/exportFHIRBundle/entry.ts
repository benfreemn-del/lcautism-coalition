import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return Response.json({ error: 'clientId required' }, { status: 400 });
    }

    // Fetch client data
    const client = await base44.entities.Client.get(clientId);
    if (!client) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    // Fetch service plan and clinical notes
    const servicePlans = await base44.entities.ServicePlan?.filter?.({ client_id: clientId }) || [];
    const clinicalNotes = await base44.entities.ClinicalNote?.filter?.({ client_id: clientId }) || [];
    const outcomesRecords = await base44.entities.OutcomeRecord?.filter?.({ client_id: clientId }) || [];

    // Build FHIR Bundle
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      id: `bundle-${clientId}-${new Date().getTime()}`,
      timestamp: new Date().toISOString(),
      entry: []
    };

    // Add Patient Resource
    bundle.entry.push({
      resource: {
        resourceType: 'Patient',
        id: clientId,
        identifier: [{ system: 'urn:lcac:patient', value: clientId }],
        name: [{ family: client.legal_last_name, given: [client.legal_first_name] }],
        birthDate: client.dob,
        gender: client.sex_at_birth?.toLowerCase(),
        address: client.address ? [{
          line: [client.address],
          city: client.city,
          state: client.state,
          postalCode: client.zip
        }] : undefined,
        telecom: client.primary_phone ? [{ system: 'phone', value: client.primary_phone }] : undefined
      },
      request: { method: 'PUT', url: `Patient/${clientId}` }
    });

    // Add Care Plan Resources
    if (servicePlans.length > 0) {
      servicePlans.forEach((plan, idx) => {
        bundle.entry.push({
          resource: {
            resourceType: 'CarePlan',
            id: `careplan-${plan.id}`,
            identifier: [{ system: 'urn:lcac:careplan', value: plan.id }],
            status: 'active',
            intent: 'plan',
            subject: { reference: `Patient/${clientId}` },
            created: plan.created_date,
            goal: plan.goals ? plan.goals.map(g => ({
              description: { text: g },
              status: 'in-progress'
            })) : [],
            activity: plan.interventions ? plan.interventions.map(i => ({
              detail: { description: i, status: 'in-progress' }
            })) : []
          },
          request: { method: 'PUT', url: `CarePlan/careplan-${plan.id}` }
        });
      });
    }

    // Add Observation Resources (Clinical Notes as Observations)
    if (clinicalNotes.length > 0) {
      clinicalNotes.forEach((note) => {
        bundle.entry.push({
          resource: {
            resourceType: 'Observation',
            id: `obs-${note.id}`,
            identifier: [{ system: 'urn:lcac:note', value: note.id }],
            status: 'final',
            code: { text: note.note_type },
            subject: { reference: `Patient/${clientId}` },
            effectiveDateTime: note.session_date,
            valueString: note.note_body,
            performer: [{ display: note.authored_by }]
          },
          request: { method: 'PUT', url: `Observation/obs-${note.id}` }
        });
      });
    }

    // Add Outcome Assessments
    if (outcomesRecords.length > 0) {
      outcomesRecords.forEach((outcome) => {
        bundle.entry.push({
          resource: {
            resourceType: 'Observation',
            id: `outcome-${outcome.id}`,
            identifier: [{ system: 'urn:lcac:outcome', value: outcome.id }],
            status: 'final',
            code: { text: 'Assessment Outcome', coding: [{ system: 'urn:lcac:outcome-type', code: outcome.outcome_type }] },
            subject: { reference: `Patient/${clientId}` },
            effectiveDateTime: outcome.assessment_date,
            valueQuantity: { value: outcome.score, unit: outcome.unit }
          },
          request: { method: 'PUT', url: `Observation/outcome-${outcome.id}` }
        });
      });
    }

    return Response.json({
      success: true,
      bundle,
      message: `FHIR bundle created with ${bundle.entry.length} resources`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});