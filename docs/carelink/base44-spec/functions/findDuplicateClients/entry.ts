import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all clients
    const clients = await base44.entities.Client.list('-created_date', 1000);

    // Group clients by potential duplicate keys
    const nameGroups = {};
    const dobGroups = {};
    const idNumberGroups = {};
    const duplicates = [];

    clients.forEach(client => {
      // Group by full name
      const fullName = `${client.legal_first_name} ${client.legal_last_name}`.trim().toLowerCase();
      if (fullName) {
        if (!nameGroups[fullName]) nameGroups[fullName] = [];
        nameGroups[fullName].push(client);
      }

      // Group by DOB
      if (client.dob) {
        if (!dobGroups[client.dob]) dobGroups[client.dob] = [];
        dobGroups[client.dob].push(client);
      }

      // Group by client ID number
      if (client.client_id_number) {
        if (!idNumberGroups[client.client_id_number]) idNumberGroups[client.client_id_number] = [];
        idNumberGroups[client.client_id_number].push(client);
      }
    });

    // Find potential duplicates (same name + DOB, or same ID number, or same name in different records)
    Object.entries(nameGroups).forEach(([name, group]) => {
      if (group.length > 1) {
        // Check if they also share DOB
        const withDob = group.filter(c => c.dob);
        if (withDob.length > 1) {
          const dobCounts = {};
          withDob.forEach(c => {
            if (!dobCounts[c.dob]) dobCounts[c.dob] = [];
            dobCounts[c.dob].push(c);
          });
          Object.values(dobCounts).forEach(dobGroup => {
            if (dobGroup.length > 1) {
              duplicates.push({
                type: 'name_and_dob_match',
                clients: dobGroup.map(c => ({ id: c.id, name: `${c.legal_first_name} ${c.legal_last_name}`, dob: c.dob, created: c.created_date }))
              });
            }
          });
        }
      }
    });

    // Check ID number duplicates
    Object.entries(idNumberGroups).forEach(([idNum, group]) => {
      if (group.length > 1) {
        duplicates.push({
          type: 'same_id_number',
          clients: group.map(c => ({ id: c.id, name: `${c.legal_first_name} ${c.legal_last_name}`, id_number: c.client_id_number, created: c.created_date }))
        });
      }
    });

    return Response.json({
      total_clients: clients.length,
      duplicate_groups: duplicates.length,
      duplicates: duplicates,
      message: duplicates.length > 0 ? `Found ${duplicates.length} potential duplicate groups` : 'No duplicates found'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});