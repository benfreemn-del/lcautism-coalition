import { jsPDF } from 'npm:jspdf@4.2.1';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId } = await req.json();
    
    if (!planId) {
      return Response.json({ error: 'Plan ID required' }, { status: 400 });
    }

    const plan = await base44.entities.ServicePlan.get(planId);
    
    if (!plan) {
      return Response.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const lineHeight = 6;
    let yPosition = margin;

    // Header
    doc.setFontSize(18);
    doc.setTextColor(0, 107, 142); // Teal color
    doc.text('SERVICE PLAN SUMMARY', margin, yPosition);
    yPosition += 10;

    // Client and Plan Info
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Client: ${plan.client_name}`, margin, yPosition);
    yPosition += lineHeight;
    doc.text(`Plan: ${plan.plan_title}`, margin, yPosition);
    yPosition += lineHeight;
    doc.text(`Status: ${plan.status}`, margin, yPosition);
    yPosition += lineHeight;

    if (plan.start_date) {
      doc.text(`Start Date: ${new Date(plan.start_date).toLocaleDateString()}`, margin, yPosition);
      yPosition += lineHeight;
    }

    if (plan.end_date) {
      doc.text(`End Date: ${new Date(plan.end_date).toLocaleDateString()}`, margin, yPosition);
      yPosition += lineHeight;
    }

    yPosition += 5;

    // Plan Summary
    if (plan.goals_summary) {
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('Plan Summary:', margin, yPosition);
      yPosition += lineHeight;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const summaryLines = doc.splitTextToSize(plan.goals_summary, pageWidth - 2 * margin);
      summaryLines.forEach((line) => {
        if (yPosition > pageHeight - margin - 10) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += lineHeight;
      });
    }

    yPosition += 5;

    // Goals Section
    if (plan.goals && plan.goals.length > 0) {
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('Goals and Progress:', margin, yPosition);
      yPosition += lineHeight;

      const statusColors = {
        'Not Started': [211, 211, 211],
        'In Progress': [135, 206, 235],
        'Achieved': [144, 238, 144],
        'Discontinued': [255, 182, 193],
      };

      plan.goals.forEach((goal, index) => {
        if (yPosition > pageHeight - margin - 20) {
          doc.addPage();
          yPosition = margin;
        }

        // Goal number and status box
        const bgColor = statusColors[goal.status] || [255, 255, 255];
        doc.setFillColor(...bgColor);
        doc.rect(margin, yPosition - 3, pageWidth - 2 * margin, 7, 'F');

        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`Goal ${index + 1}: ${goal.description}`, margin + 2, yPosition + 1);
        yPosition += lineHeight + 2;

        // Goal details
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);

        doc.text(`Status: ${goal.status}`, margin + 5, yPosition);
        yPosition += lineHeight;

        if (goal.target_date) {
          doc.text(`Target Date: ${new Date(goal.target_date).toLocaleDateString()}`, margin + 5, yPosition);
          yPosition += lineHeight;
        }

        if (goal.completion_date && goal.status === 'Achieved') {
          doc.text(`Achieved Date: ${new Date(goal.completion_date).toLocaleDateString()}`, margin + 5, yPosition);
          yPosition += lineHeight;
        }

        if (goal.notes) {
          const noteLines = doc.splitTextToSize(goal.notes, pageWidth - 2 * margin - 10);
          if (yPosition + noteLines.length * lineHeight > pageHeight - margin - 10) {
            doc.addPage();
            yPosition = margin;
          }
          doc.setFont(undefined, 'italic');
          noteLines.forEach((line) => {
            doc.text(line, margin + 5, yPosition);
            yPosition += lineHeight;
          });
          doc.setFont(undefined, 'normal');
        }

        yPosition += 3;
      });

      // Progress Summary
      yPosition += 3;
      if (yPosition > pageHeight - margin - 15) {
        doc.addPage();
        yPosition = margin;
      }

      const totalGoals = plan.goals.length;
      const achievedGoals = plan.goals.filter((g) => g.status === 'Achieved').length;
      const progressPercent = Math.round((achievedGoals / totalGoals) * 100);

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Overall Progress:', margin, yPosition);
      yPosition += lineHeight;

      doc.setFontSize(10);
      doc.text(`${achievedGoals} of ${totalGoals} goals achieved (${progressPercent}%)`, margin, yPosition);
    }

    // Footer
    yPosition = pageHeight - 15;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, yPosition);
    doc.text(`© LCAC Service Plans - Confidential`, margin, yPosition + 4);

    // Return PDF as blob
    const pdfData = doc.output('arraybuffer');
    const filename = `${plan.client_name.replace(/\s+/g, '_')}_ServicePlan_${new Date().toISOString().split('T')[0]}.pdf`;

    return new Response(pdfData, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});