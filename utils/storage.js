import { supabase } from "../config/supabase.js";

// Bucket names
const BUCKETS = {
  WORK_LOGS: "work-logs",
  PROPOSALS: "proposals",
  CONTRACTS: "contracts",
  PROJECTS: "projects",
  CHAT_FILES: "chat-files",
};

/**
 * Initialize all required storage buckets
 * Creates buckets if they don't exist
 */
export const initializeStorageBuckets = async () => {
  const bucketsToCreate = Object.values(BUCKETS);

  for (const bucketName of bucketsToCreate) {
    try {
      // Check if bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some((b) => b.name === bucketName);

      if (!bucketExists) {
        // Create bucket with public access for read
        const { data, error } = await supabase.storage.createBucket(
          bucketName,
          {
            public: false, // Private by default, use signed URLs
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: [
              "image/*",
              "application/pdf",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/vnd.ms-excel",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "text/plain",
              "application/zip",
            ],
          }
        );

        if (error) {
          console.error(`Error creating bucket ${bucketName}:`, error.message);
        } else {
          console.log(`✓ Bucket created: ${bucketName}`);
        }
      } else {
        console.log(`✓ Bucket exists: ${bucketName}`);
      }
    } catch (error) {
      console.error(`Error initializing bucket ${bucketName}:`, error.message);
    }
  }
};

/**
 * Upload file to Supabase Storage
 * @param {string} bucket - Bucket name
 * @param {string} path - File path within bucket
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} contentType - MIME type
 * @returns {Promise<{url: string, path: string}>}
 */
export const uploadFile = async (bucket, path, fileBuffer, contentType) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (error) throw error;

    // Get public URL (if bucket is public) or signed URL
    const { data: urlData } = await supabase.storage
      .from(bucket)
      .createSignedUrl(data.path, 60 * 60 * 24 * 365); // 1 year expiry

    return {
      path: data.path,
      url: urlData.signedUrl,
    };
  } catch (error) {
    console.error("Upload error:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

/**
 * Upload multiple files
 * @param {string} bucket - Bucket name
 * @param {Array} files - Array of {name, buffer, contentType}
 * @param {string} folder - Folder prefix
 * @returns {Promise<Array>}
 */
export const uploadMultipleFiles = async (bucket, files, folder = "") => {
  const uploadPromises = files.map((file) => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const filePath = folder
      ? `${folder}/${timestamp}-${randomString}-${file.name}`
      : `${timestamp}-${randomString}-${file.name}`;

    return uploadFile(bucket, filePath, file.buffer, file.contentType);
  });

  return Promise.all(uploadPromises);
};

/**
 * Delete file from storage
 * @param {string} bucket - Bucket name
 * @param {string} path - File path
 */
export const deleteFile = async (bucket, path) => {
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Delete error:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

/**
 * Get signed URL for private file
 * @param {string} bucket - Bucket name
 * @param {string} path - File path
 * @param {number} expiresIn - Expiry in seconds (default 1 hour)
 */
export const getSignedUrl = async (bucket, path, expiresIn = 3600) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error("Signed URL error:", error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * List files in a folder
 * @param {string} bucket - Bucket name
 * @param {string} folder - Folder path
 */
export const listFiles = async (bucket, folder = "") => {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(folder);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("List files error:", error);
    throw new Error(`Failed to list files: ${error.message}`);
  }
};

export { BUCKETS };