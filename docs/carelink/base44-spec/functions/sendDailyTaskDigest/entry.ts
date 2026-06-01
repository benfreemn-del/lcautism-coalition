import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all staff members
    const staff = await base44.asServiceRole.entities.StaffMember.list('-created_date', 500);

    if (!staff || staff.length === 0) {
      return Response.json({ message: 'No staff members found' });
    }

    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    let emailsSent = 0;

    // For each staff member, find their pending tasks due in 48 hours
    for (const staffMember of staff) {
      try {
        const tasks = await base44.asServiceRole.entities.Task.filter({
          staff_member_id: staffMember.id,
          status: 'Pending'
        });

        // Filter to only tasks due within 48 hours
        const urgentTasks = tasks.filter(t => {
          if (!t.due_date) return false;
          const dueDate = new Date(t.due_date);
          return dueDate >= now && dueDate <= in48Hours;
        });

        if (urgentTasks.length === 0 || !staffMember.email) {
          continue;
        }

        // Format email content
        const taskList = urgentTasks
          .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
          .map(t => {
            const daysUntilDue = Math.ceil((new Date(t.due_date) - now) / (24 * 60 * 60 * 1000));
            return `• ${t.title} - Due: ${new Date(t.due_date).toLocaleDateString()} (${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''})`;
          })
          .join('\n');

        const emailBody = `Hi ${staffMember.name},\n\nYou have ${urgentTasks.length} pending task(s) due within the next 48 hours:\n\n${taskList}\n\nPlease log in to the system to update your progress.\n\nBest regards,\nTask Management System`;

        // Send email
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: staffMember.email,
          subject: `Daily Task Digest - ${urgentTasks.length} pending task(s) due soon`,
          body: emailBody
        });

        emailsSent++;
      } catch (staffError) {
        console.error(`Error processing staff member ${staffMember.id}:`, staffError.message);
      }
    }

    return Response.json({ success: true, emailsSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});