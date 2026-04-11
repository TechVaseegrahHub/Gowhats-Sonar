const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const region = process.env.AWS_REGION || 'ap-south-1';


// Create S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const bucketName = process.env.S3_BUCKET_NAME;

function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function saveFileLocally(buffer, fileName, tenantId = 'default') {
  try {
    const uploadsBaseDir = path.join(__dirname, '../../uploads');
    const tenantUploadsDir = path.join(uploadsBaseDir, tenantId);

    // Ensure directories exist
    [uploadsBaseDir, tenantUploadsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Generate unique filename
    const uniqueFileName = `${Date.now()}_${fileName}`;
    const filePath = path.join(tenantUploadsDir, uniqueFileName);

    // Write file
    fs.writeFileSync(filePath, buffer);

    return {
      key: uniqueFileName,
      url: `/uploads/${tenantId}/${uniqueFileName}`,
      storage: 'local',
      fullPath: filePath
    };
  } catch (error) {
    console.error('Local file save error:', {
      message: error.message,
      fileName,
      tenantId
    });
    throw error;
  }
}

const uploadBuffer = async (buffer, fileName, contentType, tenantId = 'default') => {
  try {
    // Validate inputs
    if (!buffer || !fileName) {
      throw new Error('Invalid buffer or filename');
    }

    try {
      // S3 Upload Logic
      const uniqueKey = `media/${tenantId}/${Date.now()}-${fileName}`;  // Add timestamp for uniqueness

      const params = {
        Bucket: bucketName,
        Key: uniqueKey,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      };

      // Actual S3 upload logic
      const command = new PutObjectCommand(params);
      await s3Client.send(command);

      // Construct proper S3 URL
      const url = `https://${bucketName}.s3.${region}.amazonaws.com/${uniqueKey}`;

      console.log(`Successfully uploaded to S3: ${url}`);

      return {
        key: uniqueKey,
        url: url,
        storage: 's3'
      };
    } catch (s3Error) {
      console.error('S3 Upload Detailed Error:', {
        message: s3Error.message,
        code: s3Error.code,
        requestId: s3Error.$metadata?.requestId
      });

      // Fallback to local storage (but make sure the local path works)
      const localResult = saveFileLocally(buffer, fileName, tenantId);
      console.log('Falling back to local storage:', localResult);
      return localResult;
    }
  } catch (error) {
    console.error('Upload Processing Error:', {
      message: error.message,
      fileName: fileName,
      tenantId: tenantId
    });

    // Final fallback
    return saveFileLocally(buffer, fileName, tenantId);
  }
};

// Upload file from disk
const uploadFile = async (filePath, fileName) => {
  try {
    console.log(`Uploading file to S3: ${filePath}`);
    const fileContent = fs.readFileSync(filePath);
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFileName = `media/${Date.now()}-${uuidv4().substring(0, 8)}-${safeFileName}`;

    const params = {
      Bucket: bucketName,
      Key: uniqueFileName,
      Body: fileContent,
      ContentType: getContentType(fileName),
      // Remove the ACL parameter
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Create a direct URL (will need a signed URL to access)
    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${uniqueFileName}`;

    console.log(`S3 upload complete with URL: ${url}`);

    return {
      key: uniqueFileName,
      url: url,
      storage: 's3',
      originalName: fileName
    };
  } catch (error) {
    console.error('S3 File Upload Error:', error);
    // Fall back to local storage
    const localResult = saveFileLocally(fs.readFileSync(filePath), path.basename(filePath));
    console.log('Falling back to local storage:', localResult);
    return localResult;
  }
};

// Generate signed URL for temporary access
const generateSignedUrl = async (key, expiresIn = 3600) => {
  try {
    console.log(`Generating signed URL for key: ${key}`);

    // Handle both s3:// prefix and direct keys
    const actualKey = key.startsWith('s3://') ? key.substring(5) : key;

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: actualKey
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    console.log('Generated signed URL successfully');
    return signedUrl;
  } catch (error) {
    console.error('Signed URL Generation Error:', error);
    throw error;
  }
};

// Delete file from S3
const deleteFile = async (key) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('S3 File Deletion Error:', error);
    return false;
  }
};

// Get file content
const getFileContent = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    const response = await s3Client.send(command);
    return response.Body;
  } catch (error) {
    console.error('S3 Get File Error:', error);
    throw error;
  }
};

// Helper function for content types
const getContentType = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();

  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav'
  };

  return mimeTypes[ext] || 'application/octet-stream';
};

module.exports = {
  uploadBuffer,
  generateSignedUrl,
  deleteFile,
  getFileContent,
  saveFileLocally,
  uploadFile
};
