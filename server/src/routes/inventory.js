//routes/inventory.js
const express = require('express');
const router = express.Router();
const InventoryItem = require('../models/inventory');
const Settings = require('../models/settings');
const multer = require('multer');
const { Readable } = require('stream');
const fastcsv = require('fast-csv');
const whatsappSync = require('../services/whatsappSync');
const {
  DEFAULT_ALERT_CONFIG,
  normalizeInventoryAlertConfig
} = require('../services/orderInventoryService');

const MAX_ADDITIONAL_IMAGES = 10;

const normalizeAdditionalImages = (input) => {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .map((img) => String(img || '').trim())
      .filter(Boolean)
      .slice(0, MAX_ADDITIONAL_IMAGES);
  }

  const raw = String(input).trim();
  if (!raw) return [];

  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((img) => String(img || '').trim())
          .filter(Boolean)
          .slice(0, MAX_ADDITIONAL_IMAGES);
      }
    } catch (_error) {
      // Fallback to delimiter parsing below.
    }
  }

  return raw
    .split(/\s*,\s*|\s*\n\s*|\s*\|\s*/)
    .map((img) => img.trim())
    .filter(Boolean)
    .slice(0, MAX_ADDITIONAL_IMAGES);
};

// Configure multer for CSV files only
const upload = multer({
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload only CSV files (.csv)'));
    }
  }
});

// POST route to upload CSV file
router.post('/upload/csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false,
      message: "No CSV file uploaded" 
    });
  }

  try {
    const results = [];
    let rowIndex = 0;
    
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    const processStream = new Promise((resolve, reject) => {
      fastcsv.parseStream(bufferStream, {
        headers: true,
        ignoreEmpty: true,
        trim: true,
        ignoreQuotes: false,
        quote: '"',
        escape: '"',
        encoding: 'utf8'
      })
      .validate((data, cb) => {
        // Log the raw data for debugging
        console.log('Validating row:', data);
        
        const requiredFields = [
          'retailer_id', 'name', 'description', 'condition', 
          'url', 'price', 'availability', 'image_url',
        ];
        
        const missingFields = requiredFields.filter(field => {
          return !data[field] || data[field].toString().trim() === '';
        });

        if (missingFields.length > 0) {
          return cb(null, false, `Missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate price is a number
        const price = parseFloat(data.price);
        if (isNaN(price)) {
          return cb(null, false, 'Price must be a valid number');
        }

        cb(null, true);
      })
      .on('data', (row) => {
        rowIndex++;
        try {
          // Clean the data
          const cleanedData = {
            retailer_id: row.retailer_id.toString().trim(),
            name: row.name.toString().trim(),
            description: row.description.toString().trim(),
            condition: row.condition.toString().trim(),
            url: row.url.toString().trim(),
            price: parseFloat(row.price),
            availability: row.availability.toString().trim().toLowerCase(),
            image_url: row.image_url.toString().trim(),
	    additional_images: normalizeAdditionalImages(row.additional_images),
            currency: row.currency?.toString().trim() || 'INR',
            synced: false
          };

          results.push({
            ...cleanedData,
            tenant_id: req.tenantId
          });
          
          console.log(`Successfully processed row ${rowIndex}:`, cleanedData);
        } catch (error) {
          console.error(`Error processing row ${rowIndex}:`, error);
          reject(new Error(`Error in row ${rowIndex}: ${error.message}`));
        }
      })
      .on('end', (rowCount) => {
        console.log(`Parsed ${rowCount} rows`);
        if (results.length === 0) {
          reject(new Error('No valid data rows found in CSV file'));
        } else {
          resolve(results);
        }
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        reject(new Error(`Error parsing CSV: ${error.message}`));
      });
    });

    const processedResults = await processStream;
    console.log(`Attempting to insert ${processedResults.length} items`);
    
    // Insert products into MongoDB
    const savedProducts = await InventoryItem.insertMany(processedResults);

    // Attempt to sync with WhatsApp in batches
    try {
      // Process in batches of 50 (WhatsApp's limit)
      const batchSize = 50;
      for (let i = 0; i < savedProducts.length; i += batchSize) {
        const batch = savedProducts.slice(i, i + batchSize);
        await whatsappSync.syncBatchProducts(batch);
      }
      console.log(`Successfully synced ${savedProducts.length} products with WhatsApp`);
    } catch (syncError) {
      console.error('Failed to sync bulk products with WhatsApp:', syncError);
      // Products are saved, but sync failed - will be picked up by scheduled task
    }

    res.status(200).json({ 
      success: true,
      message: `Successfully imported ${processedResults.length} items from CSV file and initiated WhatsApp sync`
    });
  } catch (error) {
    console.error('CSV Processing Error:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || "Error processing CSV file"
    });
  }
});



// POST route to add a new inventory item
router.post('/', async (req, res) => {
  try {
    // Check if a product with the same retailer_id already exists
    const existingItem = await InventoryItem.findOne({
      tenant_id: req.tenantId,
      retailer_id: req.body.retailer_id
    });

    if (existingItem) {
      return res.status(409).json({ 
        message: "An item with this retailer_id already exists", 
        existingItem 
      });
    }

    const newItem = new InventoryItem({
      tenant_id: req.tenantId,
      retailer_id: req.body.retailer_id,
      name: req.body.name,
      description: req.body.description,
      condition: req.body.condition,
      url: req.body.url,
      price: req.body.price,
      image_url: req.body.image_url,
      additional_images: normalizeAdditionalImages(req.body.additional_images),
      availability: req.body.availability,
      inventory: req.body.inventory,
      currency: req.body.currency || 'INR',
      synced: false
    });

    const savedItem = await newItem.save();
    
    // Attempt to sync with WhatsApp immediately
    try {
      await whatsappSync.syncSingleProduct(savedItem);
      console.log(`Successfully synced product: ${savedItem.name} (${savedItem._id})`);
      res.status(201).json({ 
        message: "Item added and synced with WhatsApp successfully", 
        item: savedItem, 
        whatsappSynced: true 
      });
    } catch (syncError) {
      console.error('Failed to sync new product with WhatsApp:', syncError);
      // Product is saved, but sync failed - will be picked up by scheduled task
      res.status(201).json({ 
        message: "Item added successfully, but WhatsApp sync failed (will retry automatically)", 
        item: savedItem, 
        whatsappSynced: false 
      });
    }
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ message: "Error adding item", error: error.message });
  }
});

// GET route to fetch all inventory items (filtered by tenant)
router.get('/', async (req, res) => {
  try {
    const items = await InventoryItem.find({ tenant_id: req.tenantId });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: "Error fetching items", error: error.message });
  }
});

// GET low-stock alert configuration for View Catalog page
router.get('/alerts-config', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const settings = await Settings.findOne({ tenant_id: tenantId })
      .select('automationConfig.inventoryAlerts')
      .lean();

    const config = normalizeInventoryAlertConfig(
      settings?.automationConfig?.inventoryAlerts || DEFAULT_ALERT_CONFIG
    );

    return res.status(200).json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error fetching inventory alert config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory alert configuration',
      error: error.message
    });
  }
});

// PUT low-stock alert configuration for View Catalog page
router.put('/alerts-config', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = normalizeInventoryAlertConfig(req.body || {});

    let settings = await Settings.findOne({ tenant_id: tenantId });
    if (!settings) {
      settings = new Settings({ tenant_id: tenantId });
    }

    settings.automationConfig = settings.automationConfig || {};
    settings.automationConfig.inventoryAlerts = config;
    settings.markModified('automationConfig');
    await settings.save();

    return res.status(200).json({
      success: true,
      message: 'Inventory alert configuration updated successfully',
      config
    });
  } catch (error) {
    console.error('Error updating inventory alert config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update inventory alert configuration',
      error: error.message
    });
  }
});

// PUT route to update an inventory item
router.put('/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    
    // Verify the item belongs to the tenant
    const existingItem = await InventoryItem.findOne({
      _id: itemId,
      tenant_id: req.tenantId
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    // If the product was previously synced, mark it as unsynced to trigger an update
    let syncStatus = existingItem.synced;
    const normalizedAdditionalImages = normalizeAdditionalImages(req.body.additional_images);
    if (
      existingItem.name !== req.body.name ||
      existingItem.description !== req.body.description ||
      existingItem.price !== req.body.price ||
      existingItem.image_url !== req.body.image_url ||
      JSON.stringify(existingItem.additional_images || []) !== JSON.stringify(normalizedAdditionalImages) ||
      existingItem.availability !== req.body.availability ||
      existingItem.condition !== req.body.condition ||
      existingItem.url !== req.body.url ||
      existingItem.inventory !== req.body.inventory
    ) {
      // Product has changed, need to re-sync
      syncStatus = false;
    }

     const parsedInventory = Number(req.body.inventory);
    const hasValidInventory = Number.isFinite(parsedInventory) && parsedInventory >= 0;

    const alertResetPatch = {};
    if (hasValidInventory) {
      const alertSettings = await Settings.findOne({ tenant_id: req.tenantId })
        .select('automationConfig.inventoryAlerts.threshold')
        .lean();
      const threshold = Number(alertSettings?.automationConfig?.inventoryAlerts?.threshold) || DEFAULT_ALERT_CONFIG.threshold;

      if (parsedInventory > threshold) {
        alertResetPatch.low_stock_alertt_sent = false;
        alertResetPatch.low_stock_alertt_sent_at = null;
        alertResetPatch.low_stock_alertt_recipients = [];
        alertResetPatch.low_stock_alertt_threshold = null;
      }
    }

    const updatedItem = await InventoryItem.findByIdAndUpdate(
      itemId,
      {
        retailer_id: req.body.retailer_id,
        name: req.body.name,
        description: req.body.description,
        condition: req.body.condition,
        url: req.body.url,
        price: req.body.price,
        image_url: req.body.image_url,
        additional_images: normalizedAdditionalImages,
        inventory: req.body.inventory,
        availability: req.body.availability,
        currency: req.body.currency || existingItem.currency,
        synced: syncStatus,
         tenant_id: req.tenantId, // Ensure tenant_id remains unchanged
        ...alertResetPatch
      },
      { new: true } // Return the updated document
    );

    // If product needs to be re-synced, do it immediately
    if (!syncStatus) {
      try {
        await whatsappSync.syncSingleProduct(updatedItem);
        console.log(`Successfully re-synced updated product: ${updatedItem.name} (${updatedItem._id})`);
        res.status(200).json({
          message: "Item updated and re-synced with WhatsApp successfully",
          item: updatedItem,
          whatsappSynced: true
        });
      } catch (syncError) {
        console.error('Failed to re-sync updated product with WhatsApp:', syncError);
        res.status(200).json({
          message: "Item updated successfully, but WhatsApp re-sync failed (will retry automatically)",
          item: updatedItem,
          whatsappSynced: false
        });
      }
    } else {
      res.status(200).json({
        message: "Item updated successfully (no WhatsApp sync needed)",
        item: updatedItem
      });
    }
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: "Error updating item", error: error.message });
  }
});

// DELETE route to remove an inventory item
router.delete('/:id', async (req, res) => {
  try {
    const itemId = req.params.id;

    // Verify the item belongs to the tenant
    const existingItem = await InventoryItem.findOne({
      _id: itemId,
      tenant_id: req.tenantId
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    // TODO: If needed, implement WhatsApp product deletion here
    // Currently, WhatsApp doesn't offer a straightforward way to delete products via API
    // Delete from WhatsApp if it was synced
    if (existingItem.synced && existingItem.whatsapp_sync_details && existingItem.whatsapp_sync_details.productId) {
      try {
        await whatsappSync.deleteProduct(existingItem);
        console.log(`Successfully deleted product from WhatsApp: ${existingItem.name} (${existingItem._id})`);
      } catch (deleteError) {
        console.error(`Failed to delete product from WhatsApp: ${deleteError.message}`);
        // Continue with MongoDB deletion even if WhatsApp deletion fails
      }
    }

    await InventoryItem.findByIdAndDelete(itemId);

    res.status(200).json({
      message: "Item deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: "Error deleting item", error: error.message });
  }
});

// Manually trigger sync for all unsynced products
router.post('/sync', async (req, res) => {
  try {
    const result = await whatsappSync.syncAllUnsyncedProducts(req.tenantId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error syncing inventory:', error);
    res.status(500).json({ 
      success: false, 
      message: "Error syncing inventory with WhatsApp", 
      error: error.message 
    });
  }
});

// Manually sync a specific product
router.post('/sync/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    
    // Verify the item belongs to the tenant
    const existingItem = await InventoryItem.findOne({
      _id: itemId,
      tenant_id: req.tenantId
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Force sync regardless of current sync statusnpm 
    try {
      const result = await whatsappSync.syncSingleProduct(existingItem);
      res.status(200).json({
        success: true,
        message: "Product synced successfully with WhatsApp",
        data: result
      });
    } catch (syncError) {
      console.error(`Failed to sync product ${itemId} with WhatsApp:`, syncError);
      res.status(500).json({
        success: false,
        message: "Failed to sync product with WhatsApp",
        error: syncError.message
      });
    }
  } catch (error) {
    console.error('Error syncing product:', error);
    res.status(500).json({ 
      success: false, 
      message: "Error syncing product", 
      error: error.message 
    });
  }
});

// Get sync status statistics
// GET route to fetch sync status statistics
router.get('/sync/status', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    // Total number of items for this tenant
    const totalCount = await InventoryItem.countDocuments({ tenant_id: tenantId });
    
    // Items that are explicitly marked as synced
    const syncedCount = await InventoryItem.countDocuments({ 
      tenant_id: tenantId, 
      synced: true 
    });
    
    // Items that are NOT marked as synced (includes false, null, or undefined)
    const unsyncedCount = await InventoryItem.countDocuments({ 
      tenant_id: tenantId, 
      synced: { $ne: true } 
    });

    res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        synced: syncedCount,
        unsynced: unsyncedCount,
        syncedPercentage: totalCount > 0 ? ((syncedCount / totalCount) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching sync status",
      error: error.message
    });
  }
});

router.get('/by-retailer-ids', async (req, res) => {
  try {
    const retailerIds = req.query.retailerIds
      ? req.query.retailerIds.split(',').map(id => id.trim()).filter(Boolean)
      : [];

    if (retailerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'retailerIds query parameter is required'
      });
    }

    const items = await InventoryItem.find({
      tenant_id: req.tenantId,
      retailer_id: { $in: retailerIds }
    }).lean();

    // Return as a map keyed by retailer_id for easy lookup
    const itemsMap = {};
    items.forEach(item => {
      itemsMap[item.retailer_id] = item;
    });

    res.status(200).json({
      success: true,
      items: itemsMap,          // Map: { retailer_id: item }
      products: items,          // Also return as array (CatalogMessageComponent uses this)
      count: items.length
    });
  } catch (error) {
    console.error('Error fetching items by retailer IDs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching items',
      error: error.message
    });
  }
});

module.exports = router;

