import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const allClients = await base44.entities.Client.list('-created_date', 1000);
    const clientsWithoutId = allClients.filter(c => !c.client_id_number);

    let generatedCount = 0;
    const maxExisting = allClients
      .filter(c => c.client_id_number)
      .map(c => {
        const num = c.client_id_number.split('-')[1];
        return parseInt(num, 10);
      })
      .reduce((max, num) => Math.max(max, num), 0);

    let nextNum = maxExisting + 1;

    for (const client of clientsWithoutId) {
      const idNumber = `LCAC-${String(nextNum).padStart(4, '0')}`;
      await base44.entities.Client.update(client.id, { client_id_number: idNumber });
      nextNum++;
      generatedCount++;
    }

    return Response.json({
      success: true,
      message: `Generated ${generatedCount} client ID numbers`,
      generated: generatedCount,
      totalClients: allClients.length,
    });
  } catch (error) {
    console.error('Error generating IDs:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});