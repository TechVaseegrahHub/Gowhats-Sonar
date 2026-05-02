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
const { uploadImageBufferToCloudinary } = require('../utils/cloudinary');

const MAX_ADDITIONAL_IMAGES = 10;
const MAX_IMAGE_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

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

const sanitizePrice = (raw) => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
};

const sanitizeInventory = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const buildInventoryVariantPatch = (body) => {
  const patch = {};
  if (body.color !== undefined)         patch.color         = String(body.color || '').trim();
  if (body.size !== undefined)          patch.size          = String(body.size || '').trim();
  if (body.variant_group !== undefined) patch.variant_group = String(body.variant_group || '').trim();
  if (body.variant_label !== undefined) patch.variant_label = String(body.variant_label || '').trim();
  return patch;
};

const isCloudinaryImageUploadEnabled = async (tenantId) => {
  const settings = await Settings.findOne({ tenant_id: tenantId })
    .select('aiConfig.cloudinaryImageUploadEnabled')
    .lean();
  return settings?.aiConfig?.cloudinaryImageUploadEnabled !== false;
};

const csvUpload = multer({
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload only CSV files (.csv)'));
    }
  }
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_UPLOAD_SIZE_BYTES
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Please upload JPG, PNG, WebP, or GIF files.'));
    }
  }
});

// POST route to upload CSV file
router.post('/upload/csv', csvUpload.single('file'), async (req, res) => {
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
        console.log('Validating row:', data);

        const requiredFields = [
          'retailer_id', 'name', 'description', 'condition',
          'price', 'availability', 'image_url',
        ];

        const missingFields = requiredFields.filter(field => {
          return !data[field] || data[field].toString().trim() === '';
        });

        if (missingFields.length > 0) {
          return cb(null, false, `Missing required fields: ${missingFields.join(', ')}`);
        }

        const price = parseFloat(data.price);
        if (isNaN(price)) {
          return cb(null, false, 'Price must be a valid number');
        }

        cb(null, true);
      })
      .on('data', (row) => {
        rowIndex++;
        try {
          const cleanedData = {
            retailer_id: row.retailer_id.toString().trim(),
            name: row.name.toString().trim(),
            description: row.description.toString().trim(),
            condition: row.condition.toString().trim(),
            url: row.url?.toString().trim() || '',
            price: sanitizePrice(row.price),
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

    const savedProducts = await InventoryItem.insertMany(processedResults);

    try {
      const batchSize = 50;
      for (let i = 0; i < savedProducts.length; i += batchSize) {
        const batch = savedProducts.slice(i, i + batchSize);
        await whatsappSync.syncBatchProducts(batch);
      }
      console.log(`Successfully synced ${savedProducts.length} products with WhatsApp`);
    } catch (syncError) {
      console.error('Failed to sync bulk products with WhatsApp:', syncError);
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

router.post('/upload/image', (req, res) => {
  imageUpload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        success: false,
        message: uploadError.message || 'Image upload failed'
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file uploaded'
        });
      }

      const uploadEnabled = await isCloudinaryImageUploadEnabled(req.tenantId);
      if (!uploadEnabled) {
        return res.status(403).json({
          success: false,
          message: 'Cloudinary image upload is disabled for this tenant'
        });
      }

      const uploadResult = await uploadImageBufferToCloudinary(req.file.buffer, {
        mimeType: req.file.mimetype,
        folder: `gowhats/inventory/${req.tenantId}`
      });

      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        metadata: {
          width: uploadResult.width,
          height: uploadResult.height,
          format: uploadResult.format,
          bytes: uploadResult.bytes
        }
      });
    } catch (error) {
      const cloudinaryMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;

      console.error('Inventory image upload error:', cloudinaryMessage);

      return res.status(500).json({
        success: false,
        message: cloudinaryMessage || 'Failed to upload image'
      });
    }
  });
});

// POST route to add a new inventory item
router.post('/', async (req, res) => {
  try {
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
      price: sanitizePrice(req.body.price),
      image_url: req.body.image_url,
      additional_images: normalizeAdditionalImages(req.body.additional_images),
      availability: req.body.availability,
      inventory: sanitizeInventory(req.body.inventory),
      currency: req.body.currency || 'INR',
      synced: false
    });

    const savedItem = await newItem.save();

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

// GET low-stock alert configuration
router.get('/alerts-config', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const settings = await Settings.findOne({ tenant_id: tenantId })
      .select('automationConfig.inventoryAlerts')
      .lean();

    const config = normalizeInventoryAlertConfig(
      settings?.automationConfig?.inventoryAlerts || DEFAULT_ALERT_CONFIG
    );

    return res.status(200).json({ success: true, config });
  } catch (error) {
    console.error('Error fetching inventory alert config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory alert configuration',
      error: error.message
    });
  }
});

// PUT low-stock alert configuration
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

// Search inventory by product name / SKU for autocomplete
router.get('/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '8', 10), 1), 25);

    if (query.length < 2) {
      return res.status(200).json({ success: true, items: [], count: 0 });
    }

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchRegex = new RegExp(escapedQuery, 'i');
    const startsWithRegex = new RegExp(`^${escapedQuery}`, 'i');

    const items = await InventoryItem.find({
      tenant_id: req.tenantId,
      $or: [
        { name: matchRegex },
        { color: matchRegex },
        { size: matchRegex },
        { variant_group: matchRegex },
        { variant_label: matchRegex },
        { retailer_id: matchRegex },
        { retailerId: matchRegex },
        { sku: matchRegex }
      ]
    })
      .select('_id name color size variant_group variant_label retailer_id retailerId sku price inventory availability image_url')
      .limit(limit)
      .lean();

    const getSku = (item) => String(item?.retailer_id || item?.retailerId || item?.sku || '');

    const sortedItems = items.sort((a, b) => {
      const aNameStarts = startsWithRegex.test(a.name || '') ? 1 : 0;
      const bNameStarts = startsWithRegex.test(b.name || '') ? 1 : 0;
      if (aNameStarts !== bNameStarts) return bNameStarts - aNameStarts;

      const aSkuStarts = startsWithRegex.test(getSku(a)) ? 1 : 0;
      const bSkuStarts = startsWithRegex.test(getSku(b)) ? 1 : 0;
      if (aSkuStarts !== bSkuStarts) return bSkuStarts - aSkuStarts;

      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return res.status(200).json({
      success: true,
      items: sortedItems,
      count: sortedItems.length
    });
  } catch (error) {
    console.error('Error searching inventory:', error);
    return res.status(500).json({
      success: false,
      message: 'Error searching inventory',
      error: error.message
    });
  }
});

// PUT route to update an inventory item
router.put('/:id', async (req, res) => {
  try {
    const itemId = req.params.id;

    const existingItem = await InventoryItem.findOne({
      _id: itemId,
      tenant_id: req.tenantId
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (existingItem.isBillzzySynced) {
      return res.status(403).json({
        message: "This product inventory is managed by Billzzy. Please update stock in your Billing App."
      });
    }

    const incomingPrice     = sanitizePrice(req.body.price);
    const incomingInventory = sanitizeInventory(req.body.inventory);

    const normalizedAdditionalImages = normalizeAdditionalImages(req.body.additional_images);
    const normalizedVariantFields    = buildInventoryVariantPatch(req.body);

    let syncStatus = existingItem.synced;
    if (
      existingItem.name                 !== req.body.name                              ||
      existingItem.color                !== (normalizedVariantFields.color        || '') ||
      existingItem.size                 !== (normalizedVariantFields.size         || '') ||
      existingItem.variant_group        !== (normalizedVariantFields.variant_group || '') ||
      existingItem.variant_label        !== (normalizedVariantFields.variant_label || '') ||
      existingItem.description          !== req.body.description                        ||
      Number(existingItem.price)        !== incomingPrice                               ||
      existingItem.image_url            !== req.body.image_url                          ||
      JSON.stringify(existingItem.additional_images || []) !== JSON.stringify(normalizedAdditionalImages) ||
      existingItem.availability         !== req.body.availability                       ||
      existingItem.condition            !== req.body.condition                          ||
      (existingItem.url || '')          !== (req.body.url || '')                        ||
      Number(existingItem.inventory)    !== incomingInventory
    ) {
      syncStatus = false;
    }

    const hasValidInventory = incomingInventory !== null;

    const alertResetPatch = {};
    if (hasValidInventory) {
      const alertSettings = await Settings.findOne({ tenant_id: req.tenantId })
        .select('automationConfig.inventoryAlerts.threshold')
        .lean();
      const threshold = Number(alertSettings?.automationConfig?.inventoryAlerts?.threshold) || DEFAULT_ALERT_CONFIG.threshold;

      if (incomingInventory > threshold) {
        alertResetPatch.low_stock_alertt_sent        = false;
        alertResetPatch.low_stock_alertt_sent_at     = null;
        alertResetPatch.low_stock_alertt_recipients  = [];
        alertResetPatch.low_stock_alertt_threshold   = null;
      }
    }

    const updatedItem = await InventoryItem.findByIdAndUpdate(
      itemId,
      {
        retailer_id:       req.body.retailer_id,
        name:              req.body.name,
        ...normalizedVariantFields,
        description:       req.body.description,
        condition:         req.body.condition,
        url:               req.body.url || '',
        price:             incomingPrice,
        image_url:         req.body.image_url,
        additional_images: normalizedAdditionalImages,
        inventory:         incomingInventory,
        availability:      req.body.availability,
        currency:          req.body.currency || existingItem.currency,
        synced:            syncStatus,
        tenant_id:         req.tenantId,
        ...alertResetPatch
      },
      { new: true }
    );

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

    const existingItem = await InventoryItem.findOne({
      _id: itemId,
      tenant_id: req.tenantId
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (existingItem.synced && existingItem.whatsapp_sync_details && existingItem.whatsapp_sync_details.productId) {
      try {
        await whatsappSync.deleteProduct(existingItem);
        console.log(`Successfully deleted product from WhatsApp: ${existingItem.name} (${existingItem._id})`);
      } catch (deleteError) {
        console.error(`Failed to delete product from WhatsApp: ${deleteError.message}`);
      }
    }

    await InventoryItem.findByIdAndDelete(itemId);

    res.status(200).json({ message: "Item deleted successfully" });
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

    const existingItem = await InventoryItem.findOne({
      _id: itemId,
      tenant_id: req.tenantId
    });

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

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

// GET sync status statistics
router.get('/sync/status', async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const totalCount = await InventoryItem.countDocuments({ tenant_id: tenantId });
    const syncedCount = await InventoryItem.countDocuments({ tenant_id: tenantId, synced: true });
    const unsyncedCount = await InventoryItem.countDocuments({ tenant_id: tenantId, synced: { $ne: true } });

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

    const itemsMap = {};
    items.forEach(item => { itemsMap[item.retailer_id] = item; });

    res.status(200).json({
      success: true,
      items: itemsMap,
      products: items,
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
