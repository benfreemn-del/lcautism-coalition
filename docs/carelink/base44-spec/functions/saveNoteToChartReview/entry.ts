import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clinical_note_id, note_data } = await req.json();

    if (!clinical_note_id || !note_data) {
      return Response.json({ error: 'Missing clinical_note_id or note_data' }, { status: 400 });
    }

    // Fetch the clinical note
    const note = await base44.entities.ClinicalNote.get(clinical_note_id);
    if (!note) {
      return Response.json({ error: 'Clinical note not found' }, { status: 404 });
    }

    // Create a Chart Review entry for this note
    const chartReviewData = {
      client_name: note.client_name,
      reviewee: note.provider_name || note.authored_by,
      reviewer: user.full_name || user.email,
      review_date: new Date().toISOString().split('T')[0],
      review_type: 'Auto-Generated from Smart Note',
      scores: {
        timely_documentation: 4,
        session_elements: note.location && note.participants && note.start_time && note.end_time ? 4 : 3,
        intervention_quality: 3,
        outcome_documented: note.outcome ? 4 : 3,
        follow_up_plan: note.follow_up_plan ? 4 : 3,
        strength_based: 3,
        cultural_responsiveness: 3,
        clinical_reasoning: 3
      },
      strengths: `Note documents ${note.note_type} session on ${note.session_date}. Intervention: ${note.intervention?.substring(0, 100) || 'Not specified'}.`,
      areas_for_improvement: note.outcome ? 'Outcome documented. Review for strength-based language opportunities.' : 'Consider adding more detailed outcome documentation.',
      coaching_feedback: `Auto-generated review for ${note.note_type} note. Provider: ${note.provider_name || note.authored_by}. Session date: ${note.session_date}.`,
      action_items: [],
      follow_up_date: null,
      total_score: 0,
      max_score: 32,
      percentage: 0,
      status: 'Auto-Generated',
      linked_clinical_note_id: clinical_note_id,
      source: 'Smart Note Assistant'
    };

    // Calculate scores
    const totalScore = Object.values(chartReviewData.scores).reduce((a, b) => a + b, 0);
    const maxScore = 32;
    chartReviewData.total_score = totalScore;
    chartReviewData.max_score = maxScore;
    chartReviewData.percentage = Math.round((totalScore / maxScore) * 100);

    // Create the chart review record
    const chartReview = await base44.entities.ChartReview.create(chartReviewData);

    // Also add a note to the client's staff_notes
    const client = await base44.entities.Client.get(note.client_id);
    if (client) {
      const noteEntry = {
        id: clinical_note_id,
        author: user.full_name || user.email,
        email: user.email,
        content: `[${note.note_type}] ${note.session_date} - ${note.intervention?.substring(0, 100) || 'Clinical note'}...`,
        category: 'Progress Update',
        timestamp: new Date().toISOString(),
      };

      const updatedNotes = client.staff_notes || [];
      updatedNotes.unshift(noteEntry);

      await base44.entities.Client.update(note.client_id, {
        staff_notes: updatedNotes.slice(0, 100),
      });
    }

    return Response.json({ 
      success: true, 
      message: 'Note saved to Chart Review and client record',
      chart_review_id: chartReview.id
    });
  } catch (error) {
    console.error('Error saving note to chart review:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});