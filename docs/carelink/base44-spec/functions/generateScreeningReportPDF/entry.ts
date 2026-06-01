import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@4.2.1';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, clientName } = await req.json();

    if (!clientId || !clientName) {
      return Response.json({ error: 'Missing clientId or clientName' }, { status: 400 });
    }

    // Fetch all screenings for the client
    const screenings = await base44.entities.Screening.filter({ client_id: clientId }, '-administered_date', 100);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Developmental Screening Report', 20, yPosition);
    yPosition += 10;

    // Client info
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Patient: ${clientName}`, 20, yPosition);
    yPosition += 6;
    doc.text(`Report Generated: ${format(new Date(), 'MMMM d, yyyy')}`, 20, yPosition);
    yPosition += 10;

    // Divider
    doc.setDrawColor(100, 100, 100);
    doc.line(20, yPosition, pageWidth - 20, yPosition);
    yPosition += 8;

    if (screenings.length === 0) {
      doc.text('No screenings on record.', 20, yPosition);
    } else {
      screenings.forEach((screening, index) => {
        // Check if we need a new page
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 20;
        }

        // Screening title
        doc.setFont(undefined, 'bold');
        doc.setFontSize(12);
        doc.text(`${screening.tool} - ${format(new Date(screening.administered_date), 'MMMM d, yyyy')}`, 20, yPosition);
        yPosition += 7;

        // Screening details
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        const details = [
          `Age: ${screening.age_months} months`,
          `Administered By: ${screening.administered_by || 'N/A'}`,
          `Language: ${screening.language || 'English'}`,
          `Score: ${screening.total_score || 'N/A'}`,
          `Result: ${screening.result || 'Pending'}`,
        ];

        details.forEach(detail => {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(detail, 25, yPosition);
          yPosition += 5;
        });

        // Follow-up info
        if (screening.follow_up_action) {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 20;
          }
          doc.setFont(undefined, 'bold');
          doc.text('Follow-up Action:', 25, yPosition);
          yPosition += 5;
          doc.setFont(undefined, 'normal');
          doc.text(screening.follow_up_action, 25, yPosition);
          yPosition += 5;
        }

        // Notes
        if (screening.notes) {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 20;
          }
          doc.setFont(undefined, 'bold');
          doc.text('Notes:', 25, yPosition);
          yPosition += 5;
          doc.setFont(undefined, 'normal');
          doc.text(screening.notes, 25, yPosition);
          yPosition += 5;
        }

        yPosition += 5;
        doc.line(20, yPosition, pageWidth - 20, yPosition);
        yPosition += 8;
      });
    }

    // Footer
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('This report is for informational purposes and should be reviewed by a healthcare provider.', 20, pageHeight - 10);

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="screening-report-${clientId}-${format(new Date(), 'yyyy-MM-dd')}.pdf"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});