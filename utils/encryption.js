import crypto from "crypto";

/**
 * Generate a random encryption key
 * @returns {string} Base64 encoded key
 */
export const generateEncryptionKey = () => {
  return crypto.randomBytes(32).toString("base64");
};

/**
 * Encrypt data using AES-256-GCM
 * @param {Buffer} data - Data to encrypt
 * @param {string} key - Base64 encoded encryption key
 * @returns {object} {encrypted: string, iv: string, authTag: string}
 */
export const encryptData = (data, key) => {
  try {
    const keyBuffer = Buffer.from(key, "base64");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error(`Failed to encrypt data: ${error.message}`);
  }
};

/**
 * Decrypt data using AES-256-GCM
 * @param {object} encryptedData - {encrypted, iv, authTag}
 * @param {string} key - Base64 encoded encryption key
 * @returns {string} Decrypted data
 */
export const decryptData = (encryptedData, key) => {
  try {
    const keyBuffer = Buffer.from(key, "base64");
    const iv = Buffer.from(encryptedData.iv, "hex");
    const authTag = Buffer.from(encryptedData.authTag, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
};

/**
 * Encrypt file buffer
 * @param {Buffer} fileBuffer - File data
 * @param {string} key - Base64 encoded encryption key
 * @returns {Buffer} Encrypted file data
 */
export const encryptFile = (fileBuffer, key) => {
  try {
    const keyBuffer = Buffer.from(key, "base64");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);

    let encrypted = cipher.update(fileBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();
    // Prepend IV and auth tag to encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  } catch (error) {
    console.error("File encryption error:", error);
    throw new Error(`Failed to encrypt file: ${error.message}`);
  }
};

/**
 * Decrypt file buffer
 * @param {Buffer} encryptedBuffer - Encrypted file data (with IV and authTag prepended)
 * @param {string} key - Base64 encoded encryption key
 * @returns {Buffer} Decrypted file data
 */
export const decryptFile = (encryptedBuffer, key) => {
  try {
    const keyBuffer = Buffer.from(key, "base64");
    const iv = encryptedBuffer.slice(0, 16);
    const authTag = encryptedBuffer.slice(16, 32);
    const encrypted = encryptedBuffer.slice(32);

    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  } catch (error) {
    console.error("File decryption error:", error);
    throw new Error(`Failed to decrypt file: ${error.message}`);
  }
};

/**
 * Generate SHA256 hash of data
 * @param {Buffer} data - Data to hash
 * @returns {string} Hex encoded hash
 */
export const hashData = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};