const fs = require('fs');
const path = require('path');

const {
  DEFAULT_SIGNAL_PRIVATE_KEY_PATH,
  DEFAULT_SIGNAL_PUBLIC_KEY_PATH,
  generateSignalEncryptionKeyPair
} = require('../utils/encryption');

const force = process.argv.includes('--force');

const ensureWritablePath = (filePath) => {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
};

const main = () => {
  if (
    !force &&
    (fs.existsSync(DEFAULT_SIGNAL_PRIVATE_KEY_PATH) ||
      fs.existsSync(DEFAULT_SIGNAL_PUBLIC_KEY_PATH))
  ) {
    throw new Error(
      `Signal encryption keys already exist. Re-run with --force to replace them.\nPrivate key: ${DEFAULT_SIGNAL_PRIVATE_KEY_PATH}\nPublic key: ${DEFAULT_SIGNAL_PUBLIC_KEY_PATH}`
    );
  }

  ensureWritablePath(DEFAULT_SIGNAL_PRIVATE_KEY_PATH);
  ensureWritablePath(DEFAULT_SIGNAL_PUBLIC_KEY_PATH);

  const { privateKey, publicKey } = generateSignalEncryptionKeyPair();

  fs.writeFileSync(DEFAULT_SIGNAL_PRIVATE_KEY_PATH, privateKey, {
    encoding: 'utf8',
    mode: 0o600
  });
  fs.writeFileSync(DEFAULT_SIGNAL_PUBLIC_KEY_PATH, publicKey, {
    encoding: 'utf8',
    mode: 0o644
  });

  console.log('Signal-style encryption keys generated successfully.');
  console.log(`Private key: ${DEFAULT_SIGNAL_PRIVATE_KEY_PATH}`);
  console.log(`Public key: ${DEFAULT_SIGNAL_PUBLIC_KEY_PATH}`);
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

