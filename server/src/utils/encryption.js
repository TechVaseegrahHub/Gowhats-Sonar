const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENCRYPTION_PREFIX = 'enc:v1:';
const SIGNAL_ENCRYPTION_PREFIX = 'sig:v1:';
const SIGNAL_HKDF_SALT = Buffer.from('gowhats-signal-hkdf-salt-v1', 'utf8');
const SIGNAL_HKDF_INFO = Buffer.from('gowhats-customer-data-v1', 'utf8');
const SIGNAL_AAD = Buffer.from('gowhats-signal-envelope-v1', 'utf8');
const HASH_INFO = Buffer.from('gowhats-customer-hash-v1', 'utf8');

const DEFAULT_SIGNAL_PRIVATE_KEY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'keys',
  'signal-encryption-private.pem'
);
const DEFAULT_SIGNAL_PUBLIC_KEY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'keys',
  'signal-encryption-public.pem'
);

let cachedLegacyKey = null;
let cachedSignalIdentity = undefined;
let cachedHashKey = undefined;

const normalizePem = (value = '') => String(value || '').replace(/\\n/g, '\n').trim();

const readTextFileIfExists = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
};

const loadLegacyKey = () => {
  if (cachedLegacyKey) return cachedLegacyKey;

  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return null;

  let keyBuffer = null;

  if (/^[0-9a-f]{64}$/i.test(raw)) {
    keyBuffer = Buffer.from(raw, 'hex');
  } else {
    try {
      const b64 = Buffer.from(raw, 'base64');
      if (b64.length === 32) {
        keyBuffer = b64;
      }
    } catch (_err) {
      keyBuffer = null;
    }
  }

  if (!keyBuffer || keyBuffer.length !== 32) {
    keyBuffer = crypto.createHash('sha256').update(String(raw)).digest();
  }

  cachedLegacyKey = keyBuffer;
  return cachedLegacyKey;
};

const loadSignalIdentity = () => {
  if (cachedSignalIdentity !== undefined) return cachedSignalIdentity;

  const privateKeyPem =
    normalizePem(process.env.SIGNAL_ENCRYPTION_PRIVATE_KEY) ||
    normalizePem(
      readTextFileIfExists(
        process.env.SIGNAL_ENCRYPTION_PRIVATE_KEY_PATH || DEFAULT_SIGNAL_PRIVATE_KEY_PATH
      )
    );

  if (!privateKeyPem) {
    cachedSignalIdentity = null;
    return cachedSignalIdentity;
  }

  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKey = crypto.createPublicKey(privateKey);

    cachedSignalIdentity = {
      privateKey,
      publicKey
    };
  } catch (_error) {
    cachedSignalIdentity = null;
  }

  return cachedSignalIdentity;
};

const loadHashKey = () => {
  if (cachedHashKey !== undefined) return cachedHashKey;

  const legacyKey = loadLegacyKey();
  if (legacyKey) {
    cachedHashKey = legacyKey;
    return cachedHashKey;
  }

  const signalIdentity = loadSignalIdentity();
  if (signalIdentity?.privateKey) {
    const privateKeyDer = signalIdentity.privateKey.export({
      type: 'pkcs8',
      format: 'der'
    });

    cachedHashKey = crypto
      .createHash('sha256')
      .update(Buffer.from(privateKeyDer))
      .update(HASH_INFO)
      .digest();

    return cachedHashKey;
  }

  cachedHashKey = null;
  return cachedHashKey;
};

const isSignalEncryptionEnabled = () => Boolean(loadSignalIdentity());

const isLegacyEncryptionEnabled = () => Boolean(loadLegacyKey());

const isEncryptionEnabled = () => isSignalEncryptionEnabled() || isLegacyEncryptionEnabled();

const getEncryptionMode = () => {
  if (isSignalEncryptionEnabled()) return 'signal_v1';
  if (isLegacyEncryptionEnabled()) return 'legacy_aes_v1';
  return 'none';
};

const isEncryptedValue = (value) =>
  typeof value === 'string' &&
  (value.startsWith(SIGNAL_ENCRYPTION_PREFIX) || value.startsWith(ENCRYPTION_PREFIX));

const normalizePhone = (value) =>
  String(value || '').replace(/\D/g, '');

const hashValue = (value) => {
  const key = loadHashKey();
  if (!key) return '';

  return crypto.createHmac('sha256', key).update(String(value || '')).digest('hex');
};

const hashPhone = (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';
  return hashValue(normalized);
};

const legacyEncryptValue = (plaintext) => {
  const key = loadLegacyKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
};

const legacyDecryptValue = (ciphertext) => {
  const key = loadLegacyKey();
  if (!key) return ciphertext;

  const payload = ciphertext.slice(ENCRYPTION_PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) return ciphertext;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (_err) {
    return ciphertext;
  }
};

const deriveSignalDataKey = (privateKey, publicKey) => {
  const sharedSecret = crypto.diffieHellman({ privateKey, publicKey });
  const derivedKey = crypto.hkdfSync(
    'sha256',
    sharedSecret,
    SIGNAL_HKDF_SALT,
    SIGNAL_HKDF_INFO,
    32
  );

  return Buffer.from(derivedKey);
};

const signalEncryptValue = (plaintext) => {
  const identity = loadSignalIdentity();
  if (!identity?.publicKey) return null;

  try {
    const ephemeralKeys = crypto.generateKeyPairSync('x25519');
    const derivedKey = deriveSignalDataKey(ephemeralKeys.privateKey, identity.publicKey);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    cipher.setAAD(SIGNAL_AAD);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ephemeralPublicKey = ephemeralKeys.publicKey.export({
      type: 'spki',
      format: 'der'
    });

    return `${SIGNAL_ENCRYPTION_PREFIX}${Buffer.from(ephemeralPublicKey).toString('base64')}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  } catch (_error) {
    return null;
  }
};

const signalDecryptValue = (ciphertext) => {
  const identity = loadSignalIdentity();
  if (!identity?.privateKey) return ciphertext;

  const payload = ciphertext.slice(SIGNAL_ENCRYPTION_PREFIX.length);
  const [ephemeralPublicKeyB64, ivB64, tagB64, dataB64] = payload.split(':');
  if (!ephemeralPublicKeyB64 || !ivB64 || !tagB64 || !dataB64) return ciphertext;

  try {
    const ephemeralPublicKey = crypto.createPublicKey({
      key: Buffer.from(ephemeralPublicKeyB64, 'base64'),
      format: 'der',
      type: 'spki'
    });
    const derivedKey = deriveSignalDataKey(identity.privateKey, ephemeralPublicKey);
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAAD(SIGNAL_AAD);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (_error) {
    return ciphertext;
  }
};

const encryptValue = (plaintext) => {
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (typeof plaintext !== 'string') return plaintext;
  if (isEncryptedValue(plaintext)) return plaintext;

  const signalCiphertext = signalEncryptValue(plaintext);
  if (signalCiphertext) return signalCiphertext;

  return legacyEncryptValue(plaintext);
};

const decryptValue = (ciphertext) => {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;

  if (ciphertext.startsWith(SIGNAL_ENCRYPTION_PREFIX)) {
    return signalDecryptValue(ciphertext);
  }

  if (!ciphertext.startsWith(ENCRYPTION_PREFIX)) {
    return ciphertext;
  }

  return legacyDecryptValue(ciphertext);
};

const getByPath = (obj, pathValue) => {
  if (!obj || !pathValue) return undefined;
  return pathValue.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
};

const setByPath = (obj, pathValue, value) => {
  if (!obj || !pathValue) return;

  const parts = pathValue.split('.');
  const last = parts.pop();
  let cursor = obj;

  parts.forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== 'object') {
      cursor[part] = {};
    }
    cursor = cursor[part];
  });

  cursor[last] = value;
};

const encryptFields = (obj, paths = []) => {
  if (!obj) return obj;

  paths.forEach((pathValue) => {
    const value = getByPath(obj, pathValue);
    const encrypted = encryptValue(value);
    if (encrypted !== value) {
      setByPath(obj, pathValue, encrypted);
    }
  });

  return obj;
};

const decryptFields = (obj, paths = []) => {
  if (!obj) return obj;

  paths.forEach((pathValue) => {
    const value = getByPath(obj, pathValue);
    const decrypted = decryptValue(value);
    if (decrypted !== value) {
      setByPath(obj, pathValue, decrypted);
    }
  });

  return obj;
};

const decryptDocumentFields = (doc, paths = []) => {
  if (!doc) return doc;

  const target = doc._doc || doc;
  decryptFields(target, paths);
  return doc;
};

const generateSignalEncryptionKeyPair = () =>
  crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

const resetEncryptionCaches = () => {
  cachedLegacyKey = null;
  cachedSignalIdentity = undefined;
  cachedHashKey = undefined;
};

const MESSAGE_ENCRYPTION_FIELDS = [
  'text',
  'caption',
  'quotedMessageText',
  'systemMessage.body',
  'orderDetails.customerName',
  'orderDetails.customerPhone',
  'orderDetails.customerEmail',
  'orderDetails.shippingAddress',
  'orderData.customerName',
  'orderData.customerPhone',
  'orderData.customerEmail',
  'orderData.shippingAddress'
];

const ORDER_ENCRYPTION_FIELDS = [
  'customerPhone',
  'customerDetails.name',
  'customerDetails.email',
  'customerDetails.phone',
  'shippingAddress.name',
  'shippingAddress.phone',
  'shippingAddress.addressLine1',
  'shippingAddress.addressLine2',
  'shippingAddress.city',
  'shippingAddress.state',
  'shippingAddress.pincode',
  'shippingAddress.country',
  'billingAddress.name',
  'billingAddress.phone',
  'billingAddress.addressLine1',
  'billingAddress.addressLine2',
  'billingAddress.city',
  'billingAddress.state',
  'billingAddress.pincode',
  'billingAddress.country'
];

module.exports = {
  DEFAULT_SIGNAL_PRIVATE_KEY_PATH,
  DEFAULT_SIGNAL_PUBLIC_KEY_PATH,
  ENCRYPTION_PREFIX,
  SIGNAL_ENCRYPTION_PREFIX,
  decryptFields,
  decryptDocumentFields,
  decryptValue,
  encryptFields,
  encryptValue,
  generateSignalEncryptionKeyPair,
  getEncryptionMode,
  hashPhone,
  isEncryptedValue,
  isEncryptionEnabled,
  isLegacyEncryptionEnabled,
  isSignalEncryptionEnabled,
  MESSAGE_ENCRYPTION_FIELDS,
  normalizePhone,
  ORDER_ENCRYPTION_FIELDS,
  resetEncryptionCaches
};

