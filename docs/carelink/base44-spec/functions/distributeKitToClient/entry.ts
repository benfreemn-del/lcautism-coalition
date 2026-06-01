import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { 
      kitTemplateId, 
      kitTemplateName, 
      customKitName, 
      contents, 
      clientId, 
      clientName,
      language,
      distributionLocation = 'Office',
      notes,
      staffSignature 
    } = payload;

    if (!contents || contents.length === 0) {
      return Response.json({ error: 'Kit must have contents' }, { status: 400 });
    }

    // Generate unique kit ID
    const year = new Date().getFullYear();
    const allKits = await base44.entities.KitAssembly.list();
    const kitNumber = String(allKits.length + 1).padStart(4, '0');
    const uniqueKitId = `KIT-${year}-${kitNumber}`;

    // Calculate total cost
    let totalCost = 0;
    for (const item of contents) {
      try {
        const inventoryItem = await base44.entities.InventoryItem.get(item.itemId);
        if (inventoryItem) {
          totalCost += (inventoryItem.unitCost || 0) * item.quantity;
        }
      } catch {
        // Item not found, continue
      }
    }

    // Create kit assembly record
    const kitAssembly = {
      kitTemplateId,
      kitTemplateName,
      customKitName,
      uniqueKitId,
      status: 'Distributed',
      assembledBy: user.email,
      assembledByName: user.full_name,
      assembledDate: new Date().toISOString(),
      contents,
      totalCost,
      fundingSource: contents[0]?.fundingSource || 'General',
      storageLocation: 'Distributed',
      distributedDate: new Date().toISOString(),
      distributedTo: clientName,
      distributedBy: user.email,
      distributionLocation,
      language,
      notes,
      familyAcknowledgement: true,
      checklistReviewed: true,
      handoffScriptUsed: true,
      signatureUrl: staffSignature || null
    };

    await base44.entities.KitAssembly.create(kitAssembly);

    // Deduct from inventory and create transactions
    for (const item of contents) {
      try {
        const inventoryItem = await base44.entities.InventoryItem.get(item.itemId);
        
        if (inventoryItem) {
          // Update stock level
          const newStock = (inventoryItem.stockOnHand || 0) - item.quantity;
          await base44.entities.InventoryItem.update(item.itemId, {
            stockOnHand: newStock,
            lastDistributedDate: new Date().toISOString().split('T')[0]
          });

          // Create inventory transaction
          await base44.entities.InventoryTransaction.create({
            transactionType: 'Distribution',
            itemId: item.itemId,
            itemSku: inventoryItem.sku,
            itemName: inventoryItem.nameEn,
            quantity: -item.quantity,
            quantityBefore: inventoryItem.stockOnHand || 0,
            quantityAfter: newStock,
            clientId,
            clientName,
            kitAssemblyId: uniqueKitId,
            transactionDate: new Date().toISOString(),
            performedBy: user.email,
            performedByName: user.full_name,
            reason: 'Kit distribution to family',
            reasonCategory: 'Standard Distribution',
            fundingSource: inventoryItem.fundingSource,
            unitCost: inventoryItem.unitCost,
            totalCost: (inventoryItem.unitCost || 0) * item.quantity,
            storageLocation: inventoryItem.storageLocation,
            language,
            handoffScriptUsed: true,
            itemsReviewed: true,
            familyAcknowledgement: true
          });
        }
      } catch (error) {
        console.error(`Error processing item ${item.itemId}:`, error);
      }
    }

    return Response.json({ 
      success: true, 
      kitId: uniqueKitId,
      message: `Kit ${uniqueKitId} distributed successfully to ${clientName}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});