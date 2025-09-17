/**
 * RSA Key Utility Functions
 * Handles flexible key formats for payware MCP server
 */

/**
 * Normalize RSA private key to proper PEM format
 * Accepts keys with or without headers/footers
 * Preserves the original key format (PKCS#8 vs RSA) when headers are present
 * @param {string} privateKey - RSA private key in various formats
 * @returns {string} Properly formatted PEM private key
 */
export function normalizePrivateKey(privateKey) {
  if (!privateKey) {
    throw new Error('Private key is required');
  }

  // Remove any extra whitespace and line breaks
  const cleanKey = privateKey.trim().replace(/\r/g, '');

  // Check if key already has proper PEM format - preserve the original format
  if (cleanKey.includes('-----BEGIN RSA PRIVATE KEY-----') || cleanKey.includes('-----BEGIN PRIVATE KEY-----')) {
    // Key already has headers, return as-is (with proper line breaks)
    return cleanKey.replace(/\r?\n/g, '\n');
  }

  // Remove any existing partial headers/footers
  let keyContent = cleanKey
    .replace(/-----BEGIN[^-]*-----/g, '')
    .replace(/-----END[^-]*-----/g, '')
    .replace(/\s+/g, '') // Remove all whitespace
    .trim();

  if (!keyContent) {
    throw new Error('Private key content is empty after normalization');
  }

  // Add line breaks every 64 characters for proper PEM format
  const formattedContent = keyContent.match(/.{1,64}/g)?.join('\n') || keyContent;

  // Default to PKCS#8 format (more modern and widely supported)
  // Use PRIVATE KEY instead of RSA PRIVATE KEY for better compatibility
  return `-----BEGIN PRIVATE KEY-----
${formattedContent}
-----END PRIVATE KEY-----`;
}

/**
 * Normalize RSA public key to proper PEM format
 * Accepts keys with or without headers/footers
 * @param {string} publicKey - RSA public key in various formats
 * @returns {string} Properly formatted PEM public key
 */
export function normalizePublicKey(publicKey) {
  if (!publicKey) {
    throw new Error('Public key is required');
  }

  // Remove any extra whitespace and line breaks
  const cleanKey = publicKey.trim().replace(/\r/g, '');
  
  // Check if key already has proper PEM format
  if (cleanKey.includes('-----BEGIN PUBLIC KEY-----') || cleanKey.includes('-----BEGIN RSA PUBLIC KEY-----')) {
    return cleanKey;
  }
  
  // Remove any existing partial headers/footers
  let keyContent = cleanKey
    .replace(/-----BEGIN[^-]*-----/g, '')
    .replace(/-----END[^-]*-----/g, '')
    .replace(/\s+/g, '') // Remove all whitespace
    .trim();
  
  if (!keyContent) {
    throw new Error('Public key content is empty after normalization');
  }
  
  // Add line breaks every 64 characters for proper PEM format
  const formattedContent = keyContent.match(/.{1,64}/g)?.join('\n') || keyContent;
  
  // Return with proper PUBLIC KEY headers
  return `-----BEGIN PUBLIC KEY-----
${formattedContent}
-----END PUBLIC KEY-----`;
}

/**
 * Validate if a string looks like base64 encoded key content
 * @param {string} content - Content to validate
 * @returns {boolean} True if looks like valid base64 key content
 */
export function isValidKeyContent(content) {
  if (!content || content.length < 100) return false; // RSA keys should be much longer
  
  // Check if it contains only valid base64 characters
  const base64Regex = /^[A-Za-z0-9+/=\s]*$/;
  return base64Regex.test(content);
}

/**
 * Get key format information
 * @param {string} key - Key to analyze
 * @returns {Object} Information about the key format
 */
export function getKeyInfo(key) {
  const cleanKey = key.trim();
  
  const info = {
    hasHeaders: false,
    isPrivate: false,
    isPublic: false,
    format: 'unknown',
    length: key.length
  };
  
  // Check for headers
  if (cleanKey.includes('-----BEGIN') && cleanKey.includes('-----END')) {
    info.hasHeaders = true;
  }
  
  // Check key type
  if (cleanKey.includes('PRIVATE KEY')) {
    info.isPrivate = true;
    info.format = cleanKey.includes('RSA PRIVATE KEY') ? 'rsa-private' : 'pkcs8-private';
  } else if (cleanKey.includes('PUBLIC KEY')) {
    info.isPublic = true;
    info.format = cleanKey.includes('RSA PUBLIC KEY') ? 'rsa-public' : 'pkcs8-public';
  } else if (isValidKeyContent(cleanKey)) {
    info.format = 'base64-content';
  }
  
  return info;
}