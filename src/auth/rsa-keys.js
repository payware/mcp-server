import { generateKeyPairSync } from 'crypto';
import { LOCAL } from '../shared/tool-annotations.js';

/**
 * Generate RSA key pair for payware API authentication
 * @param {number} keySize - RSA key size in bits (default: 2048)
 * @returns {Object} Object containing publicKey and privateKey in PEM format
 */
export function generateRSAKeyPair(keySize = 2048) {
  // node:crypto rather than node-forge, which was a dependency for this call alone. The encodings are
  // the ones forge produced - PKCS#1 private ("BEGIN RSA PRIVATE KEY"), SPKI public - so the output
  // reads the same; only forge's CRLF line endings become LF.
  const { privateKey: privateKeyPem, publicKey: publicKeyPem } = generateKeyPairSync('rsa', {
    modulusLength: keySize,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  return {
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
    keySize,
    generated: new Date().toISOString()
  };
}

/**
 * Generate RSA keys tool implementation
 */
export const generateRSAKeysTool = {
  name: "payware_authentication_generate_rsa_keys",
  annotations: LOCAL,
  description: "Generate RSA key pair for payware API authentication",
  inputSchema: {
    type: "object",
    properties: {
      keySize: {
        type: "number",
        description: "RSA key size in bits",
        minimum: 2048,
        maximum: 8192
      }
    },
    additionalProperties: false
  },
  
  async handler(args) {
    const keySize = args.keySize || 2048;
    
    if (keySize < 2048) {
      throw new Error("Key size must be at least 2048 bits for security");
    }
    
    const keyPair = generateRSAKeyPair(keySize);
    
    return {
      content: [{
        type: "text",
        text: `🔐 **RSA Key Pair Generated Successfully**

**⚠️ SECURITY WARNING ⚠️**
- Store private key securely and never share it
- Use different keys for production environment
- Sandbox keys should not be used in production

**Private Key:**
\`\`\`
${keyPair.privateKey}
\`\`\`

**Public Key:**
\`\`\`
${keyPair.publicKey}
\`\`\`

**Key Details:**
- Size: ${keyPair.keySize} bits
- Generated: ${keyPair.generated}
- Purpose: payware API authentication (sandbox only)

**Next Steps:**
1. Save private key to secure location
2. Register public key with payware sandbox
3. Use private key to create JWT tokens`
      }]
    };
  }
};