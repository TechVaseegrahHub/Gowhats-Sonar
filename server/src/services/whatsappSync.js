const axios = require('axios');
require('dotenv').config();
const Catalog = require('../models/settings.js');
const Tenant = require('../models/Tenant.js');

// WhatsApp API Configuration
const BASE_URL = 'https://graph.facebook.com/v22.0';
const MAX_ADDITIONAL_IMAGES = 10;

const normalizeAdditionalImageUrls = (images, primaryImageUrl) => {
  if (!Array.isArray(images)) return [];

  const seen = new Set();
  return images
    .map((img) => String(img || '').trim())
    .filter(Boolean)
    .filter((img) => img !== primaryImageUrl)
    .filter((img) => {
      if (seen.has(img)) return false;
      seen.add(img);
      return true;
    })
    .slice(0, MAX_ADDITIONAL_IMAGES);
};

const toFormEncodedBody = (payload) => {
  const params = new URLSearchParams();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (Array.isArray(value)) {
      if (value.length === 0) return;
      params.append(key, JSON.stringify(value));
      return;
    }

    params.append(key, String(value));
  });

  return params.toString();
};

const parseJsonSafe = (value) => {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

/**
 * Get access token for a tenant
 */
const getAccessToken = async (tenantId) => {
  try {
    const tenant = await Tenant.findById(tenantId);

    if (!tenant || !tenant.whatsappConfig || !tenant.whatsappConfig.accessToken) {
      throw new Error('WhatsApp access token not found for tenant');
    }

    const token = tenant.whatsappConfig.accessToken;

    console.log('Token type:', typeof token);
    console.log('Token length:', token.length);
    console.log('Token first 10 chars:', token.substring(0, 10));

    const invalidCharsRegex = /[^\x20-\x7E]/g;
    const invalidChars = token.match(invalidCharsRegex);
    if (invalidChars) {
      console.error('Invalid characters found in token:', invalidChars);
      const cleanToken = token.replace(invalidCharsRegex, '');
      console.log('Using cleaned token instead');
      return cleanToken;
    }

    return token;
  } catch (error) {
    console.error('Error retrieving access token:', error);
    throw error;
  }
};

/**
 * Get the catalog ID from settings for a specific tenant
 */
const getCatalogIdFromSettings = async (tenantId) => {
  try {
    const settings = await Catalog.findOne({ tenant_id: tenantId });
    if (!settings || !settings.catalogId) {
      throw new Error('WhatsApp catalog ID not found in settings');
    }
    return settings.catalogId;
  } catch (error) {
    console.error('Error retrieving catalog ID from settings:', error);
    throw error;
  }
};

/**
 * Converts standard price into WhatsApp API format
 */
const convertToWhatsAppPrice = (price, currency) => {
  const currencyMultipliers = {
    INR: 100, USD: 100, EUR: 100, SGD: 100, JPY: 1,
  };

  const multiplier = currencyMultipliers[currency];
  if (multiplier === undefined) throw new Error(`Unsupported currency: ${currency}`);

  const numericPrice = Number(price);
  if (isNaN(numericPrice)) throw new Error(`Invalid price value: ${price}`);

  const convertedPrice = Math.round(numericPrice * multiplier);
  return convertedPrice.toString();
};

/**
 * Transform inventory item to WhatsApp product format
 */
const formatProductForWhatsApp = (item) => {
  const currency = (item.currency || 'INR').toUpperCase();

  if (item.price === undefined || item.price === null) {
    throw new Error(`Price is required for WhatsApp product sync: ${item.name}`);
  }

  const product = {
    name: item.name,
    description: item.description || item.name,
    price: convertToWhatsAppPrice(item.price, currency),
    currency: currency,
    retailer_id: item.retailer_id,
    availability: mapAvailabilityToWhatsApp(item.availability || 'in_stock'),
    image_url: item.image_url,
    url: item.url,
  };

const additionalImageUrls = normalizeAdditionalImageUrls(item.additional_images, item.image_url);
  if (additionalImageUrls.length > 0) {
    product.additional_image_urls = additionalImageUrls;
  }

  const mappedCondition = mapConditionToWhatsApp(item.condition);
  if (mappedCondition) {
    product.condition = mappedCondition;
  }

  if (item.inventory !== undefined && item.inventory !== null) {
    const inventoryValue = parseInt(item.inventory, 10);
    if (!isNaN(inventoryValue)) {
      product.inventory = inventoryValue;
    }
  }

  return product;
};

const mapAvailabilityToWhatsApp = (availability) => {
  const availabilityMap = {
    'instock': 'in stock', 'in_stock': 'in stock',
    'outofstock': 'out of stock', 'out_of_stock': 'out of stock',
    'preorder': 'preorder', 'availablefororder': 'available for order',
    'available_for_order': 'available for order', 'discontinued': 'discontinued',
    'pending': 'pending', 'markassold': 'mark_as_sold', 'mark_as_sold': 'mark_as_sold'
  };
  const normalized = availability.toLowerCase().replace(/\s+/g, '');
  return availabilityMap[normalized] || 'in stock';
};

const mapConditionToWhatsApp = (condition) => {
  const conditionMap = {
    'new': 'new', 'refurbished': 'refurbished', 'used': 'used',
    'used_like_new': 'used_like_new', 'used_good': 'used_good',
    'used_fair': 'used_fair', 'cpo': 'cpo', 'open_box_new': 'open_box_new'
  };
  if (!condition || condition.trim() === '') return 'new';
  const normalized = condition.toLowerCase().trim();
  return conditionMap[normalized] || 'new';
};

/**
 * Sync a single product to WhatsApp
 */
const syncSingleProduct = async (item) => {
  const InventoryItem = require('../models/inventory.js');
  try {
    if (item.whatsapp_sync_details && item.whatsapp_sync_details.productId) {
      return await updateProduct(item);
    }

    const catalogId = await getCatalogIdFromSettings(item.tenant_id);
    const accessToken = await getAccessToken(item.tenant_id);
    const product = formatProductForWhatsApp(item);

    try {
      const response = await axios({
        method: 'POST',
        url: `${BASE_URL}/${catalogId}/products`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: product
      });

      await InventoryItem.findByIdAndUpdate(item._id, {
        synced: true,
        whatsapp_sync_status: 'success',
        whatsapp_sync_details: {
          syncedAt: new Date(),
          productId: response.data.id,
          catalogId: catalogId
        }
      });

      return response.data;
    } catch (firstError) {
      // Check for Duplicate retailer_id
      if (firstError.response?.status === 400 && 
          firstError.response?.headers?.['www-authenticate']?.includes('Duplicate retailer_id')) {
        
        const getProductsResponse = await axios({
          method: 'GET',
          url: `${BASE_URL}/${catalogId}/products`,
          headers: { 'Authorization': `Bearer ${accessToken}` },
          params: { fields: 'id,retailer_id', filter: `retailer_id(${item.retailer_id})` }
        });

        if (getProductsResponse.data?.data?.length > 0) {
          const existingProduct = getProductsResponse.data.data[0];
          await InventoryItem.findByIdAndUpdate(item._id, {
            synced: true,
            whatsapp_sync_status: 'success',
            whatsapp_sync_details: {
              syncedAt: new Date(),
              productId: existingProduct.id,
              catalogId: catalogId
            }
          });
          return await updateProduct({ ...item, whatsapp_sync_details: { productId: existingProduct.id } });
        }
      }
      throw firstError;
    }
  } catch (error) {
    console.error(`Failed to sync product ${item._id}: ${error.message}`);
    await InventoryItem.findByIdAndUpdate(item._id, {
      synced: false,
      whatsapp_sync_status: 'failed',
      whatsapp_sync_error: { message: error.message, details: error.response?.data, attemptedAt: new Date() }
    });
    throw error;
  }
};

/**
 * Sync multiple products using batch API
 */
const syncBatchProducts = async (items) => {
  const InventoryItem = require('../models/inventory.js');
  const tenantId = items[0].tenant_id;

  try {
    const catalogId = await getCatalogIdFromSettings(tenantId);
    const accessToken = await getAccessToken(tenantId);

    const validatedBatch = items.map(item => {
      try {
        const product = formatProductForWhatsApp(item);
        return {
	item,
          request: {
            method: 'POST',
            relative_url: `${catalogId}/products`,
            body: toFormEncodedBody(product),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }
        };
      } catch (_error) { return null; }
    }).filter(i => i !== null);

    if (validatedBatch.length === 0) return [];

    const response = await axios({
      method: 'POST',
      url: `${BASE_URL}/${catalogId}/batch`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: { batch: validatedBatch.map(({ request }) => request) }
    });

    if (response.data && Array.isArray(response.data)) {
      const ops = response.data.map((res, index) => {
	 const batchEntry = validatedBatch[index];
        const item = batchEntry?.item;
        if (!item) return null;

        if (res.code >= 200 && res.code < 300) {
          const parsedBody = parseJsonSafe(res.body);
          return InventoryItem.findByIdAndUpdate(item._id, {
            synced: true,
            whatsapp_sync_status: 'success',
            whatsapp_sync_details: {
              syncedAt: new Date(),
              productId: parsedBody?.id || item.whatsapp_sync_details?.productId,
              catalogId
            }
          });
        } else {
          return InventoryItem.findByIdAndUpdate(item._id, {
            synced: false,
            whatsapp_sync_status: 'failed',
            whatsapp_sync_error: { code: res.code, message: res.body, attemptedAt: new Date() }
          });
        }
      });
      await Promise.all(ops.filter(Boolean));
    }
    return response.data;
  } catch (error) {
    console.error('Batch sync failed:', error.message);
    throw error;
  }
};

const updateProduct = async (item) => {
  const InventoryItem = require('../models/inventory.js');
  try {
    const accessToken = await getAccessToken(item.tenant_id);
    const whatsappProductId = item.whatsapp_sync_details.productId;
    const product = formatProductForWhatsApp(item);

    const response = await axios({
      method: 'POST',
      url: `${BASE_URL}/${whatsappProductId}`,
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      data: product
    });

    await InventoryItem.findByIdAndUpdate(item._id, {
      synced: true,
      whatsapp_sync_status: 'success',
      whatsapp_sync_details: { syncedAt: new Date(), updatedAt: new Date(), productId: whatsappProductId }
    });

    return response.data;
  } catch (error) {
    throw error;
  }
};

const deleteProduct = async (item) => {
  const InventoryItem = require('../models/inventory.js');
  try {
    const accessToken = await getAccessToken(item.tenant_id);
    const whatsappProductId = item.whatsapp_sync_details.productId;
    await axios({
      method: 'DELETE',
      url: `${BASE_URL}/${whatsappProductId}`,
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    await InventoryItem.findByIdAndUpdate(item._id, { synced: false, whatsapp_sync_status: 'deleted' });
  } catch (error) { throw error; }
};

/**
 * FIXED FUNCTION: Sync all unsynced products
 */
const syncAllUnsyncedProducts = async (tenantId) => {
  const InventoryItem = require('../models/inventory.js');

  try {
    // FIX: Using $ne: true finds both 'false' AND missing 'synced' fields
    const query = { synced: { $ne: true } };
    
    if (tenantId) {
      query.tenant_id = tenantId;
    }

    console.log('Query for finding unsynced products:', JSON.stringify(query));

    const unsyncedProducts = await InventoryItem.find(query);

    console.log(`Found ${unsyncedProducts.length} unsynced products`);

    if (unsyncedProducts.length === 0) {
      return { success: true, message: 'No unsynced products found' };
    }

    // Group by tenant
    const productsByTenant = unsyncedProducts.reduce((acc, product) => {
      const tid = product.tenant_id?.toString() || 'unknown';
      if (!acc[tid]) acc[tid] = [];
      acc[tid].push(product);
      return acc;
    }, {});

    for (const [tid, products] of Object.entries(productsByTenant)) {
      if (tid === 'unknown') continue;

      console.log(`Processing ${products.length} products for tenant ${tid}`);

      if (products.length > 1) {
        const batchSize = 50;
        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);
          try { await syncBatchProducts(batch); } catch (e) { console.error(e); }
        }
      } else {
        try { await syncSingleProduct(products[0]); } catch (e) { console.error(e); }
      }
    }

    return { success: true, message: `Processed ${unsyncedProducts.length} products` };
  } catch (error) {
    console.error('Error syncing products:', error);
    return { success: false, message: error.message };
  }
};

module.exports = {
  syncSingleProduct,
  syncBatchProducts,
  syncAllUnsyncedProducts,
  updateProduct,
  deleteProduct
};
