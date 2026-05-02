const crypto = require('crypto');
const axios = require('axios');

const MAX_DATA_URI_SIZE_BYTES = 10 * 1024 * 1024;

function parseCloudinaryUrl(cloudinaryUrl = process.env.CLOUDINARY_URL || '') {
  const trimmedUrl = String(cloudinaryUrl || '').trim();
  if (!trimmedUrl) {
    throw new Error('CLOUDINARY_URL is not configured');
  }

  let parsed;
  try {
    parsed = new URL(trimmedUrl);
  } catch (_error) {
    throw new Error('CLOUDINARY_URL is invalid');
  }

  if (parsed.protocol !== 'cloudinary:') {
    throw new Error('CLOUDINARY_URL must use the cloudinary:// format');
  }

  const cloudName = decodeURIComponent(parsed.hostname || '');
  const apiKey = decodeURIComponent(parsed.username || '');
  const apiSecret = decodeURIComponent(parsed.password || '');

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('CLOUDINARY_URL is missing cloud name, api key, or api secret');
  }

  return {
    cloudName,
    apiKey,
    apiSecret
  };
}

function buildCloudinarySignature(params = {}, apiSecret) {
  const serialized = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${serialized}${apiSecret}`)
    .digest('hex');
}

async function uploadImageBufferToCloudinary(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('A valid image buffer is required');
  }

  if (buffer.length > MAX_DATA_URI_SIZE_BYTES) {
    throw new Error('Image exceeds the 10MB upload limit');
  }

  const { cloudName, apiKey, apiSecret } = parseCloudinaryUrl();
  const mimeType = String(options.mimeType || 'application/octet-stream').trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = String(options.folder || '').trim();

  const signatureParams = {
    folder,
    timestamp
  };

  const signature = buildCloudinarySignature(signatureParams, apiSecret);
  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

  const requestBody = new URLSearchParams({
    file: dataUri,
    api_key: apiKey,
    timestamp: String(timestamp),
    signature
  });

  if (folder) {
    requestBody.set('folder', folder);
  }

  const response = await axios.post(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    requestBody.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000
    }
  );

  return response.data;
}

module.exports = {
  parseCloudinaryUrl,
  uploadImageBufferToCloudinary
};

