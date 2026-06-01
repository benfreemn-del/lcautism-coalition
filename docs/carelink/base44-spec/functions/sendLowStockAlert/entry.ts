import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all inventory items
    const inventoryItems = await base44.entities.InventoryItem.list();
    
    // Filter items below reorder threshold
    const lowStockItems = inventoryItems.filter(item => 
      item.stockOnHand <= item.reorderThreshold && 
      item.status === 'Active'
    );

    if (lowStockItems.length === 0) {
      return Response.json({ 
        message: 'No low stock items',
        items: []
      });
    }

    // Get alert email from secrets
    const alertEmail = Deno.env.get('INVENTORY_ALERT_EMAIL');
    if (!alertEmail) {
      return Response.json({ 
        error: 'INVENTORY_ALERT_EMAIL secret not configured' 
      }, { status: 500 });
    }

    // Build email content
    const itemList = lowStockItems.map(item => {
      const shortage = item.reorderThreshold - item.stockOnHand;
      return `• ${item.nameEn} (SKU: ${item.sku})
  Current Stock: ${item.stockOnHand}
  Reorder Threshold: ${item.reorderThreshold}
  Suggested Order Quantity: ${item.reorderQuantity}
  Shortage: ${shortage} units below threshold`;
    }).join('\n\n');

    const emailBody = `
<h2>Low Stock Alert - Inventory Reorder Needed</h2>
<p><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}</p>
<p><strong>Total Items Needing Reorder:</strong> ${lowStockItems.length}</p>
<hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
${itemList}
<hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
<p style="color: #666; font-size: 12px;">
This is an automated alert from the LCAC Inventory Management System.
Please review and place orders as needed.
</p>
    `.trim();

    const emailSubject = `📦 Low Stock Alert: ${lowStockItems.length} Item(s) Need Reordering`;

    // Send email notification
    await base44.integrations.Core.SendEmail({
      to: alertEmail,
      subject: emailSubject,
      body: emailBody
    });

    return Response.json({
      message: 'Low stock alert sent successfully',
      items: lowStockItems.map(item => ({
        sku: item.sku,
        name: item.nameEn,
        currentStock: item.stockOnHand,
        reorderThreshold: item.reorderThreshold,
        suggestedOrderQuantity: item.reorderQuantity
      })),
      emailSentTo: alertEmail
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});