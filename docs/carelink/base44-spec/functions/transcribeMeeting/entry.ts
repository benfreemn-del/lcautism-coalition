import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { clientId, clientName, meetingType, meetingDate, meetingTime, location, participants, audioFileUrl } = body;

    if (!clientId || !meetingType || !meetingDate || !audioFileUrl) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Step 1: Transcribe audio
    const transcriptResponse = await base44.integrations.Core.TranscribeAudio({
      audio_url: audioFileUrl
    });

    const rawTranscript = transcriptResponse;

    // Step 2: Use LLM to add speaker labels and extract key decisions
    const analysisResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a clinical meeting transcriptionist. Review this meeting transcript and:
1. Identify and label each speaker (Teacher, Parent, RN, etc.) based on context
2. Extract key decisions and action items
3. Flag any personally identifiable health information (PHI) or confidential content that should be redacted

Transcript:
${rawTranscript}

Return as JSON with:
- labeled_transcript: transcript with [SPEAKER: role] labels
- key_decisions: array of decision items
- redaction_flags: array with {timestamp, reason, content}`,
      response_json_schema: {
        type: "object",
        properties: {
          labeled_transcript: { type: "string" },
          key_decisions: {
            type: "array",
            items: { type: "string" }
          },
          redaction_flags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timestamp: { type: "string" },
                reason: { type: "string" },
                content: { type: "string" }
              }
            }
          }
        }
      }
    });

    // Step 3: Create meeting transcript record
    const meetingTranscript = await base44.asServiceRole.entities.MeetingTranscript.create({
      client_id: clientId,
      client_name: clientName,
      meeting_type: meetingType,
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      location: location,
      participants: participants || [],
      audio_file_url: audioFileUrl,
      raw_transcript: rawTranscript,
      redaction_notes: analysisResponse.redaction_flags.map(flag => ({
        timestamp: flag.timestamp,
        speaker: flag.speaker || 'Unknown',
        reason: flag.reason,
        redacted_text: flag.content
      })),
      key_decisions: analysisResponse.key_decisions,
      final_transcript: analysisResponse.labeled_transcript,
      consent_status: 'Pending',
      transcribed_by: user.email,
      transcription_date: new Date().toISOString().split('T')[0],
      status: 'Under Review'
    });

    return Response.json({
      transcript_id: meetingTranscript.id,
      client_name: clientName,
      meeting_type: meetingType,
      meeting_date: meetingDate,
      status: 'Awaiting coordinator consent and redaction review',
      raw_transcript: rawTranscript,
      key_decisions: analysisResponse.key_decisions,
      redaction_flags_count: analysisResponse.redaction_flags.length,
      message: 'Meeting transcribed. Requires: (1) Consent capture, (2) Redaction review, (3) Final approval'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});