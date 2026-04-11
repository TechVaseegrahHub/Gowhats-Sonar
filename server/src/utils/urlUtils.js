const normalizePath = (path, tenantId) => {
  if (!path) return '';
  
  // Already a full URL
  if (path.startsWith('http')) return path;
  
  // Blob URL (for previews)
  if (path.startsWith('blob:')) return path;
  
  // Handle S3 keys
  if (path.startsWith('media/')) {
    const parts = path.split('/');
    if (parts.length >= 3) {
      return `/uploads/${parts[1]}/${parts[2]}`;
    }
    return `/uploads/${path.replace('media/', '')}`;
  }
  
  // Already a proper uploads path
  if (path.startsWith('/uploads/')) return path;
  
  // Ensure we have tenant ID
  if (!tenantId) {
    console.warn('Missing tenant ID for path:', path);
    return `/uploads/${path}`;
  }
  
  // Simple filename
  return `/uploads/${tenantId}/${path}`;
};

module.exports = {
  normalizePath
};
