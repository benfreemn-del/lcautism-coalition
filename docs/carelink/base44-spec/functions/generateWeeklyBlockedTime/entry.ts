import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { format, addWeeks, startOfWeek } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the request payload with configuration
    const body = await req.json();
    const {
      daysOfWeek = [1, 5], // Monday (1) and Friday (5) by default
      startTime = '09:00',
      endTime = '10:00',
      reason = 'Clinic Close',
      description = '',
      weeksToGenerate = 4,
      staffMember = user.full_name,
    } = body;

    const blockedTimes = [];
    const seriesId = `auto_${Date.now()}`;
    const today = new Date();
    const startDate = startOfWeek(today, { weekStartsOn: 1 }); // Monday

    // Generate blocks for each week
    for (let week = 0; week < weeksToGenerate; week++) {
      const weekStart = addWeeks(startDate, week);

      // For each selected day of the week
      for (const dayOfWeek of daysOfWeek) {
        const blockDate = new Date(weekStart);
        blockDate.setDate(blockDate.getDate() + dayOfWeek); // 0 = Monday, 1 = Tuesday, etc.

        const dateStr = format(blockDate, 'yyyy-MM-dd');
        const startDateTime = new Date(`${dateStr}T${startTime}`).toISOString();
        const endDateTime = new Date(`${dateStr}T${endTime}`).toISOString();

        blockedTimes.push(
          base44.entities.BlockedTime.create({
            staff_member: staffMember,
            start_time: startDateTime,
            end_time: endDateTime,
            reason,
            description,
            series_id: seriesId,
          })
        );
      }
    }

    const results = await Promise.all(blockedTimes);

    return Response.json({
      success: true,
      blocksCreated: results.length,
      seriesId,
      message: `Generated ${results.length} blocked time slots`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});