import { createCipheriv, createDecipheriv, randomBytes, CipherKey } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For AES-256-GCM
const AUTH_TAG_LENGTH = 16;

interface EncryptedData {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export const encrypt = (plaintext: string, masterKey: string): EncryptedData => {
  if (!masterKey || masterKey.length !== 64) { // 32 bytes * 2 for hex
    throw new Error('ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes).');
  }
  const keyBuffer: CipherKey = Buffer.from(masterKey, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
};

export const decrypt = (encryptedData: EncryptedData, masterKey: string): string => {
  if (!masterKey || masterKey.length !== 64) {
    throw new Error('ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes).');
  }
  const keyBuffer: CipherKey = Buffer.from(masterKey, 'hex');
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData.encryptedValue, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};
