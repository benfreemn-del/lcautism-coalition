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
      return Response.json({ error: 'Missing clientId' }, { status: 400 });
    }

    // Fetch client profile
    const client = await base44.entities.Client.get(clientId);
    if (!client) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    // Fetch available resources
    const allResources = await base44.entities.Resource.list();

    // Build client profile context
    const profileContext = `
Client: ${client.legal_first_name} ${client.legal_last_name}
Age: ${calculateAge(client.dob)} years old
Location: ${client.city}, ${client.state}
Language: ${client.preferred_language}
Housing: ${client.housing_status}
Contact reasons: ${client.contact_reasons?.join(', ')}
    `.trim();

    // Call InvokeLLM to match resources
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a care coordinator matching community resources for a child with autism and their family. 

Child Profile:
${profileContext}

Available Resources Database:
${allResources.map(r => `- ${r.name} (${r.category}): ${r.description} | Contact: ${r.contact} | Location: ${r.city}`).join('\n')}

Based on the child's profile, recommend the TOP 5 most appropriate resources. For each recommendation, provide:
1. Resource name
2. Why it's a good match (specific reasoning)
3. Match confidence (0-100)

Return as JSON with array of recommendations.`,
      response_json_schema: {
        type: "object",
        properties: {
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                resource_name: { type: "string" },
                reason: { type: "string" },
                match_score: { type: "number" }
              }
            }
          }
        }
      }
    });

    // Map recommendations to actual resource records
    const suggestedResources = response.recommendations.map(rec => {
      const resource = allResources.find(r => r.name === rec.resource_name);
      return {
        resource_id: resource?.id || '',
        resource_name: rec.resource_name,
        category: resource?.category || 'General',
        match_score: rec.match_score,
        reason: rec.reason,
        contact: resource?.contact || '',
        location: resource?.city || ''
      };
    });

    // Create resource match record for approval
    const resourceMatch = await base44.asServiceRole.entities.ResourceMatch.create({
      client_id: clientId,
      client_name: `${client.legal_first_name} ${client.legal_last_name}`,
      match_date: new Date().toISOString().split('T')[0],
      profile_factors: [
        `Age: ${calculateAge(client.dob)}`,
        `Location: ${client.city}, ${client.state}`,
        `Language: ${client.preferred_language}`,
        `Housing: ${client.housing_status}`
      ],
      suggested_resources: suggestedResources,
      coordinator_approval: false,
      status: 'Pending Approval'
    });

    return Response.json({
      match_id: resourceMatch.id,
      client_name: `${client.legal_first_name} ${client.legal_last_name}`,
      suggestions: suggestedResources,
      status: 'Awaiting coordinator approval',
      message: 'Resources matched and ready for review before sharing with family'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function calculateAge(dob) {
  if (!dob) return 0;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}