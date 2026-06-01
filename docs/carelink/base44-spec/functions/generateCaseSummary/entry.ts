import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { clientId, startDate, endDate } = body;

    if (!clientId || !startDate || !endDate) {
      return Response.json({ error: 'Missing clientId, startDate, or endDate' }, { status: 400 });
    }

    // Fetch chronological notes for the client
    const notes = await base44.entities.ClinicalNote.filter(
      { client_id: clientId },
      'session_date',
      100
    );

    if (!notes.length) {
      return Response.json({ error: 'No notes found for this client in the period' }, { status: 404 });
    }

    // Build context from notes
    const notesText = notes
      .map(n => `[${n.session_date}] ${n.note_type}\n${n.note_body}`)
      .join('\n\n');

    // Call InvokeLLM to generate summary
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a clinical case summary writer for a pediatric autism coalition. Analyze the following chronological clinical notes and draft a professional, family-friendly case summary highlighting:
1. Child's current functioning and strengths
2. Key challenges and concerns
3. Progress since last review
4. Current services and interventions
5. Next steps and recommendations

Clinical Notes:
${notesText}

Draft a concise but comprehensive summary (300-500 words) suitable for care coordination and family discussion. Use clear language while maintaining clinical accuracy.`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          key_themes: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    });

    const client = await base44.entities.Client.get(clientId);

    // Create case summary record for coordinator review
    const caseSummary = await base44.asServiceRole.entities.CaseSummary.create({
      client_id: clientId,
      client_name: `${client.legal_first_name} ${client.legal_last_name}`,
      summary_period_start: startDate,
      summary_period_end: endDate,
      source_notes_count: notes.length,
      ai_draft_summary: response.summary,
      ai_key_themes: response.key_themes,
      status: 'Draft',
      saved: false,
      created_by: user.email,
      created_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      summary_id: caseSummary.id,
      client_name: client.legal_first_name + ' ' + client.legal_last_name,
      notes_analyzed: notes.length,
      draft_summary: response.summary,
      key_themes: response.key_themes,
      status: 'Awaiting coordinator review',
      message: 'Summary drafted and ready for coordinator editing and approval'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});