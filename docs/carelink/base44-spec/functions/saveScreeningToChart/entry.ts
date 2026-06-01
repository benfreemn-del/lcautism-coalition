import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { screening } = await req.json();

    if (!screening || !screening.client_id) {
      return Response.json({ error: 'Missing screening data or client_id' }, { status: 400 });
    }

    // Create clinical note with screening results
    const chartNote = await base44.entities.ClinicalNote.create({
      client_id: screening.client_id,
      client_name: screening.client_name,
      note_type: 'Screening',
      title: `${screening.tool} Screening`,
      content: `Screening Tool: ${screening.tool}
Age (months): ${screening.age_months || 'N/A'}
Date Administered: ${screening.administered_date || 'N/A'}
Administered By: ${screening.administered_by || 'N/A'}
Language: ${screening.language || 'English'}
Total Score: ${screening.total_score || 'N/A'}
Result: ${screening.result || 'Pending'}
Follow-up Action: ${screening.follow_up_action || 'None'}
Follow-up Date: ${screening.follow_up_date || 'N/A'}
Notes: ${screening.notes || 'None'}`,
      category: 'Screening',
      author: user.full_name,
      email: user.email,
      is_pinned: screening.result === 'Refer', // Pin referral results
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      chartNoteId: chartNote.id,
      message: `Screening results saved to ${screening.client_name}'s chart`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});