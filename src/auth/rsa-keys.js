import forge from 'node-forge';

/**
 * Generate RSA key pair for payware API authentication
 * @param {number} keySize - RSA key size in bits (default: 2048)
 * @returns {Object} Object containing publicKey and privateKey in PEM format
 */
export function generateRSAKeyPair(keySize = 2048) {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: keySize });
  
  const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keyPair.publicKey);
  
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