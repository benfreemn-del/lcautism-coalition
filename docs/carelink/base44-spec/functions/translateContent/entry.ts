import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { contentType, text } = body;

    if (!text || !contentType) {
      return Response.json({ error: 'Missing text or contentType' }, { status: 400 });
    }

    // Call InvokeLLM for translation
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a medical translator specializing in pediatric autism care materials for Spanish-speaking families. Translate the following ${contentType} to accurate, culturally appropriate Spanish. Ensure terminology matches clinical standards used in Washington state.

Original text:
"${text}"

Respond ONLY with: 
1. The Spanish translation (no explanations)
2. A confidence score (0-100) on a new line

Format:
[SPANISH TEXT HERE]
confidence:75`,
      response_json_schema: {
        type: "object",
        properties: {
          spanish_translation: { type: "string" },
          confidence_score: { type: "number" }
        }
      }
    });

    // Extract translation and confidence
    const translatedText = response.spanish_translation;
    const confidenceScore = response.confidence_score;
    
    // Flag for review if confidence is below 85%
    const flaggedForReview = confidenceScore < 85;

    // Create translation review record
    const translationRecord = await base44.asServiceRole.entities.TranslationReview.create({
      content_type: contentType,
      original_text: text,
      translated_text: translatedText,
      confidence_score: confidenceScore,
      flagged_for_review: flaggedForReview,
      review_status: flaggedForReview ? 'Pending' : 'Approved',
      published: false
    });

    return Response.json({
      translation_id: translationRecord.id,
      original: text,
      translated: translatedText,
      confidence_score: confidenceScore,
      flagged_for_review: flaggedForReview,
      message: flaggedForReview ? 'Low confidence - flagged for human review' : 'Translation ready for approval'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});