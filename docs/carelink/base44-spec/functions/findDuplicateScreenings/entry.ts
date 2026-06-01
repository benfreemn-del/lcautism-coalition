import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all screenings
    const screenings = await base44.entities.Screening.list('-created_date', 1000);

    // Group by client_id + administered_date + tool
    const groups = {};
    const duplicates = [];

    screenings.forEach(screening => {
      const key = `${screening.client_id}|${screening.administered_date}|${screening.tool}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(screening);
    });

    // Find duplicates
    Object.entries(groups).forEach(([key, group]) => {
      if (group.length > 1) {
        duplicates.push({
          client_id: group[0].client_id,
          client_name: group[0].client_name,
          tool: group[0].tool,
          date: group[0].administered_date,
          count: group.length,
          records: group.map(s => ({ id: s.id, score: s.total_score, result: s.result, created: s.created_date }))
        });
      }
    });

    return Response.json({
      total_screenings: screenings.length,
      duplicate_groups: duplicates.length,
      duplicates: duplicates,
      message: duplicates.length > 0 ? `Found ${duplicates.length} duplicate screening groups` : 'No duplicate screenings found'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});