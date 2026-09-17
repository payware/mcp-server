import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { normalizePrivateKey, getKeyInfo } from '../utils/key-utils.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { createDeterministicJSON } from '../utils/json-serializer.js';

/**
 * Generate SHA-256 hash for JWT contentSha256 header (PREFERRED)
 *
 * PAYWARE REQUIREMENT: The SHA-256 hash must be calculated from the EXACT same
 * compact JSON string that will be sent as the HTTP request body.
 *
 * CRITICAL: Any difference in whitespace, property order, or formatting
 * between the string used for hash and the HTTP body will cause authentication
 * failures with ERR_INVALID_CONTENT_HASH errors.
 *
 * @param {Object|string} body - Request body (object will be consistently serialized)
 * @returns {string} Base64 encoded SHA-256 hash for JWT contentSha256 header
 */
export function generateContentSha256(body) {
  if (!body) return null;

  // CRITICAL: Use deterministic JSON serialization with sorted keys
  // This ensures consistent hashes regardless of property order
  const bodyString = typeof body === 'string' ? body : createDeterministicJSON(body);

  // Generate SHA-256 hash as raw binary and encode in base64
  const hash = crypto.createHash('sha256');
  hash.update(bodyString, 'utf8');
  return hash.digest('base64');
}

/**
 * Generate MD5 hash for JWT contentMd5 header (DEPRECATED - use generateContentSha256)
 *
 * @deprecated Use generateContentSha256 instead. MD5 is still supported by the server
 * for backwards compatibility but is deprecated.
 *
 * @param {Object|string} body - Request body (object will be consistently serialized)
 * @returns {string} Base64 encoded MD5 hash for JWT contentMd5 header
 */
export function generateContentMd5(body) {
  if (!body) return null;

  const bodyString = typeof body === 'string' ? body : createDeterministicJSON(body);

  // Generate MD5 hash as raw binary and encode in base64
  const hash = crypto.createHash('md5');
  hash.update(bodyString, 'utf8');
  return hash.digest('base64');
}

/**
 * Generate the exact JSON string for both JWT content hash and HTTP request body
 *
 * PAYWARE REQUIREMENT: The same compact JSON string must be used for:
 * 1. JWT contentSha256 calculation (passed to generateContentSha256)
 * 2. HTTP request body (sent to payware API)
 *
 * This function guarantees consistency by using deterministic serialization.
 * Any mismatch between these two uses will result in authentication failure.
 *
 * @param {Object} payload - Request payload object
 * @returns {string} Compact JSON string for both hash calculation and HTTP body
 */
export function serializePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;

  // Use deterministic JSON serialization with sorted keys
  // This ensures consistent serialization regardless of property order
  return createDeterministicJSON(payload);
}

/**
 * Create JWT token for payware API authentication according to documentation
 * @param {string} partnerId - Partner ID from payware
 * @param {string} privateKey - RSA private key in PEM format
 * @param {Object} requestBody - Request body (for POST/PUT/PATCH requests)
 * @returns {Object} Object containing JWT token and metadata
 */
export function createJWTToken(partnerId, privateKey, requestBody = null) {
  const now = Math.floor(Date.now() / 1000);
  
  // Normalize the private key to handle flexible formats
  const normalizedKey = normalizePrivateKey(privateKey);
  
  // JWT Header (as per documentation)
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  // Add contentSha256 to header if request body exists (for POST/PUT/PATCH)
  // CRITICAL: The requestBody here must be the EXACT same string that will
  // be sent as the HTTP request body, otherwise hash will not match
  if (requestBody) {
    header.contentSha256 = generateContentSha256(requestBody);
  }
  
  // JWT Payload (as per documentation)
  const payload = {
    iss: partnerId,
    aud: 'https://payware.eu',  // Required by documentation
    iat: now
  };
  
  const token = jwt.sign(payload, normalizedKey, { 
    algorithm: 'RS256',
    header: header
  });
  
  return {
    token,
    partnerId,
    audience: 'https://payware.eu',
    issuedAt: new Date(now * 1000).toISOString(),
    contentSha256: header.contentSha256 || null,
    hasBody: !!requestBody
  };
}

/**
 * Create request signature for payware API (legacy - may not be needed with proper JWT)
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - API path
 * @param {Object} body - Request body (for POST requests)
 * @param {string} privateKey - RSA private key in PEM format
 * @returns {string} Base64 encoded signature
 */
export function createRequestSignature(method, path, body, privateKey) {
  const bodyString = body ? JSON.stringify(body) : '';
  const stringToSign = `${method.toUpperCase()}${path}${bodyString}`;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(stringToSign);
  sign.end();
  
  const signature = sign.sign(privateKey, 'base64');
  return signature;
}

/**
 * Validate and debug JWT token implementation
 */
export const validateJWTTokenTool = {
  name: "payware_authentication_validate_jwt",
  description: "Validate and debug JWT token structure, decode payload/headers, verify content hash (SHA-256/MD5) calculation, and check RS256 signature format for payware API compliance",
  inputSchema: {
    type: "object",
    properties: {
      jwtToken: {
        type: "string",
        description: "JWT token to validate and debug"
      },
      expectedPayload: {
        type: "object",
        description: "Expected request body (optional - for content hash validation)"
      }
    },
    required: ["jwtToken"],
    additionalProperties: false
  },

  async handler(args) {
    const { jwtToken, expectedPayload } = args;

    if (!jwtToken) {
      throw new Error("JWT token is required");
    }

    try {
      // Parse JWT token without verification first
      const decoded = jwt.decode(jwtToken, { complete: true });

      if (!decoded) {
        throw new Error("Invalid JWT token format");
      }

      const { header, payload } = decoded;

      // Determine which hash type is used
      const hasContentSha256 = !!header.contentSha256;
      const hasContentMd5 = !!header.contentMd5;
      const hasContentHash = hasContentSha256 || hasContentMd5;

      // Validation results
      const validation = {
        structure: true,
        algorithm: header.alg === 'RS256',
        type: header.typ === 'JWT',
        audience: payload.aud === 'https://payware.eu',
        issuer: !!payload.iss,
        issuedAt: !!payload.iat,
        contentHash: hasContentHash
      };

      // Content hash validation if expected payload provided
      let hashValidation = null;
      if (expectedPayload && hasContentHash) {
        if (hasContentSha256) {
          const calculatedSha256 = generateContentSha256(expectedPayload);
          hashValidation = {
            type: 'SHA-256 (preferred)',
            provided: header.contentSha256,
            calculated: calculatedSha256,
            matches: header.contentSha256 === calculatedSha256,
            deterministicJson: createDeterministicJSON(expectedPayload)
          };
        } else if (hasContentMd5) {
          const calculatedMd5 = generateContentMd5(expectedPayload);
          hashValidation = {
            type: 'MD5 (deprecated)',
            provided: header.contentMd5,
            calculated: calculatedMd5,
            matches: header.contentMd5 === calculatedMd5,
            deterministicJson: createDeterministicJSON(expectedPayload)
          };
        }
      }

      // Check for common issues
      const issues = [];
      if (!validation.algorithm) issues.push("Algorithm should be 'RS256'");
      if (!validation.type) issues.push("Type should be 'JWT'");
      if (!validation.audience) issues.push("Audience should be 'https://payware.eu'");
      if (!validation.issuer) issues.push("Missing issuer (iss) claim");
      if (!validation.issuedAt) issues.push("Missing issued at (iat) claim");
      if (hasContentMd5 && !hasContentSha256) {
        issues.push("Using deprecated MD5 hash - consider upgrading to SHA-256 (contentSha256)");
      }
      if (hashValidation && !hashValidation.matches) {
        issues.push("Content hash mismatch - ensure deterministic JSON serialization with sorted keys");
      }

      const overallValid = Object.values(validation).every(v => v) && (!hashValidation || hashValidation.matches);

      return {
        content: [{
          type: "text",
          text: `🔍 **JWT Token Validation Report**

${overallValid ? '✅ **VALID JWT TOKEN**' : '❌ **INVALID JWT TOKEN**'}

## JWT Structure Analysis

**Header:**
\`\`\`json
${JSON.stringify(header, null, 2)}
\`\`\`

**Payload:**
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

## Validation Results

${validation.structure ? '✅' : '❌'} **Structure**: JWT has valid 3-part structure
${validation.algorithm ? '✅' : '❌'} **Algorithm**: RS256 ${validation.algorithm ? '(correct)' : `(found: ${header.alg})`}
${validation.type ? '✅' : '❌'} **Type**: JWT ${validation.type ? '(correct)' : `(found: ${header.typ})`}
${validation.audience ? '✅' : '❌'} **Audience**: https://payware.eu ${validation.audience ? '(correct)' : `(found: ${payload.aud})`}
${validation.issuer ? '✅' : '❌'} **Issuer**: ${payload.iss || 'Missing'}
${validation.issuedAt ? '✅' : '❌'} **Issued At**: ${payload.iat ? new Date(payload.iat * 1000).toISOString() : 'Missing'}
${validation.contentHash ? '✅' : 'ℹ️'} **Content Hash**: ${header.contentSha256 ? `SHA-256: ${header.contentSha256}` : header.contentMd5 ? `MD5 (deprecated): ${header.contentMd5}` : 'Not present (OK for GET requests)'}

${hashValidation ? `## Content Hash Validation

${hashValidation.matches ? '✅' : '❌'} **${hashValidation.type} Match**: ${hashValidation.matches ? 'Correct' : 'Mismatch detected'}
**Provided**: \`${hashValidation.provided}\`
**Calculated**: \`${hashValidation.calculated}\`

**Deterministic JSON Used**:
\`\`\`json
${hashValidation.deterministicJson}
\`\`\`

${!hashValidation.matches ? `
⚠️ **Hash Mismatch Debugging**:

PAYWARE REQUIREMENT: The EXACT same compact JSON string must be used for both JWT content hash and HTTP body.

**Common Causes**:
1. Different JSON strings used for JWT hash vs HTTP body
2. Extra whitespace or formatting differences
3. Property order variations between serializations

**Solution**: Use deterministic JSON serialization to guarantee consistency

**Correct Implementation Pattern**:
\`\`\`python
# Use deterministic JSON serialization
json_body = json.dumps(payload, sort_keys=True, separators=(',', ':'))
jwt_token = create_jwt_token(json_body)
response = requests.post(url, data=json_body, headers=headers)
\`\`\`
` : ''}
` : ''}

${issues.length > 0 ? `## ⚠️ Issues Found

${issues.map(issue => `- ${issue}`).join('\n')}

## Recommendations

${issues.includes("Algorithm should be 'RS256'") ? '- Update JWT algorithm to RS256\n' : ''}
${issues.includes("Type should be 'JWT'") ? '- Set JWT type to "JWT"\n' : ''}
${issues.includes("Audience should be 'https://payware.eu'") ? '- Set audience to "https://payware.eu" (not just "payware")\n' : ''}
${issues.includes("Missing issuer (iss) claim") ? '- Add your partner ID as the issuer claim\n' : ''}
${issues.includes("Missing issued at (iat) claim") ? '- Add current Unix timestamp as issued at claim\n' : ''}
${issues.some(i => i.includes('hash mismatch')) ? '- Use deterministic JSON serialization with sorted keys\n- Ensure same JSON string for hash calculation and HTTP body\n' : ''}
` : '## ✅ No Issues Found\n\nYour JWT token is properly formatted for payware API usage.'}

## Technical Details

**Token Length**: ${jwtToken.length} characters
**Validation Timestamp**: ${new Date().toISOString()}
**payware API Compliance**: ${overallValid ? 'PASS' : 'FAIL'}

---
**Execution Info:**
- Tool: payware_authentication_validate_jwt
- Executed: ${new Date().toISOString()}
- Status: ${overallValid ? '✅ Valid' : '❌ Invalid'}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **JWT Validation Failed**

**Error**: ${error.message}

## Common JWT Issues

1. **Invalid Format**: JWT should have 3 parts separated by dots (header.payload.signature)
2. **Invalid Base64**: JWT parts must be valid Base64 encoded
3. **Malformed JSON**: Header and payload must be valid JSON
4. **Missing Components**: Ensure all required claims are present

## Debug Steps

1. Check that your JWT has exactly 2 dots separating 3 parts
2. Verify each part is valid Base64
3. Decode header and payload manually to check JSON structure
4. Ensure all required claims (iss, aud, iat) are present

**Token Provided**: ${jwtToken.substring(0, 50)}...

---
**Execution Info:**
- Tool: payware_authentication_validate_jwt
- Executed: ${new Date().toISOString()}
- Status: ❌ Error`
        }]
      };
    }
  }
};

/**
 * Test JWT token creation with step-by-step breakdown
 */
export const testJWTTokenTool = {
  name: "payware_authentication_test_jwt",
  description: "Test JWT token creation process with detailed step-by-step breakdown, showing deterministic JSON serialization, SHA-256 hash calculation, and final JWT structure",
  inputSchema: {
    type: "object",
    properties: {
      partnerId: {
        type: "string",
        description: "Partner ID for JWT creation (defaults to environment)"
      },
      requestPayload: {
        type: "object",
        description: "Sample request payload to demonstrate SHA-256 hash calculation"
      },
      showPrivateKey: {
        type: "boolean",
        description: "Whether to show private key details (for debugging)",
        default: false
      }
    },
    additionalProperties: false
  },

  async handler(args) {
    const {
      partnerId = getPartnerIdSafe(),
      requestPayload = { amount: "25.50", currency: "EUR", reasonL1: "Test payment" },
      showPrivateKey = false
    } = args;

    if (!partnerId) {
      throw new Error("Partner ID is required. Set PAYWARE_PARTNER_ID environment variable or provide as parameter.");
    }

    const privateKey = getPrivateKeySafe();
    if (!privateKey) {
      throw new Error("Private key is required. Set PAYWARE_SANDBOX_PRIVATE_KEY_PATH environment variable.");
    }

    try {
      const steps = [];

      // Step 1: JSON Serialization
      const originalJson = JSON.stringify(requestPayload);
      const deterministicJson = createDeterministicJSON(requestPayload);
      const sortedKeys = Object.keys(requestPayload).sort();

      steps.push(`**Step 1: JSON Serialization**
Input payload:
\`\`\`json
${JSON.stringify(requestPayload, null, 2)}
\`\`\`

❌ **Standard JSON.stringify()** (property order varies):
\`\`\`json
${originalJson}
\`\`\`

✅ **Deterministic JSON** (sorted keys):
\`\`\`json
${deterministicJson}
\`\`\`

**Key Sorting**: [${sortedKeys.join(', ')}]`);

      // Step 2: SHA-256 Calculation
      const sha256Hash = generateContentSha256(requestPayload);

      steps.push(`**Step 2: SHA-256 Hash Calculation**
Using deterministic JSON string:
\`\`\`
${deterministicJson}
\`\`\`

SHA-256 hash (Base64): \`${sha256Hash}\`

**Process**:
1. Create SHA-256 hash from UTF-8 bytes of deterministic JSON
2. Encode hash as Base64
3. Include in JWT header as \`contentSha256\``);

      // Step 3: JWT Header Construction
      const jwtHeader = {
        alg: 'RS256',
        typ: 'JWT',
        contentSha256: sha256Hash
      };

      steps.push(`**Step 3: JWT Header Construction**
\`\`\`json
${JSON.stringify(jwtHeader, null, 2)}
\`\`\`

**Requirements**:
- Algorithm: RS256 (RSA with SHA-256)
- Type: JWT
- Content SHA-256: ${sha256Hash}`);

      // Step 4: JWT Payload Construction
      const now = Math.floor(Date.now() / 1000);
      const jwtPayload = {
        iss: partnerId,
        aud: 'https://payware.eu',
        iat: now
      };

      steps.push(`**Step 4: JWT Payload Construction**
\`\`\`json
${JSON.stringify(jwtPayload, null, 2)}
\`\`\`

**Requirements**:
- Issuer (iss): Your partner ID
- Audience (aud): **MUST be https://payware.eu** (not just "payware")
- Issued At (iat): Unix timestamp (${new Date(now * 1000).toISOString()})`);

      // Step 5: JWT Token Creation
      const finalToken = createJWTToken(partnerId, privateKey, requestPayload);

      steps.push(`**Step 5: JWT Token Creation**
Final JWT token:
\`\`\`
${finalToken.token}
\`\`\`

**Token Components**:
- Header (Base64): \`${finalToken.token.split('.')[0]}\`
- Payload (Base64): \`${finalToken.token.split('.')[1]}\`
- Signature (Base64): \`${finalToken.token.split('.')[2].substring(0, 20)}...\`

**Length**: ${finalToken.token.length} characters`);

      // Step 6: Private Key Information
      const keyInfo = getKeyInfo(privateKey);
      const keyDetails = showPrivateKey ?
        `**Private Key Details**:
- Format: ${keyInfo.format}
- Has Headers: ${keyInfo.hasHeaders}
- Length: ${keyInfo.length} characters
- Type: ${keyInfo.isPrivate ? 'Private' : 'Unknown'}` :
        `**Private Key**: Available (${keyInfo.format}, ${keyInfo.length} chars)
*Use \`showPrivateKey: true\` for more details*`;

      steps.push(`**Step 6: Signature Creation**
${keyDetails}

**Signature Process**:
1. Combine Base64(header) + "." + Base64(payload)
2. Sign with RSA private key using SHA-256
3. Encode signature as Base64
4. Final JWT: header.payload.signature`);

      return {
        content: [{
          type: "text",
          text: `🧪 **JWT Token Creation Test - Step by Step**

${steps.join('\n\n---\n\n')}

## ✅ **Complete JWT Ready for API Use**

**Headers for API Request**:
\`\`\`
Authorization: Bearer ${finalToken.token}
Content-Type: application/json
Api-Version: 1
\`\`\`

**HTTP Request Body** (must match deterministic JSON):
\`\`\`json
${deterministicJson}
\`\`\`

## 🔑 **Key Insights**

1. **Deterministic JSON is Critical**: Property order MUST be sorted
2. **Hash Consistency**: Same JSON string for both SHA-256 hash and HTTP body
3. **Audience Requirement**: Must be "https://payware.eu" (include https://)
4. **RS256 Algorithm**: RSA with SHA-256 signature
5. **Content Hash in Header**: Not in payload, but in JWT header (use contentSha256)

## 🐛 **Common Mistakes to Avoid**

❌ Using \`JSON.stringify()\` without sorted keys
❌ Different JSON for hash calculation vs HTTP request
❌ Setting audience to "payware" instead of "https://payware.eu"
❌ Putting contentSha256 in payload instead of header
❌ Using wrong algorithm (HS256 instead of RS256)
❌ Using deprecated contentMd5 instead of contentSha256

---
**Execution Info:**
- Tool: payware_authentication_test_jwt
- Partner ID: ${partnerId}
- Executed: ${new Date().toISOString()}
- Status: ✅ Complete`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **JWT Testing Failed**

**Error**: ${error.message}

**Common Issues**:
- Missing environment variables (PAYWARE_PARTNER_ID, PAYWARE_SANDBOX_PRIVATE_KEY_PATH)
- Invalid private key format
- Permission issues reading private key file

**Debug Steps**:
1. Check that environment variables are set
2. Verify private key file exists and is readable
3. Ensure private key is in proper PEM format

---
**Execution Info:**
- Tool: payware_authentication_test_jwt
- Executed: ${new Date().toISOString()}
- Status: ❌ Error`
        }]
      };
    }
  }
};

/**
 * Create JWT token tool implementation
 */
export const createJWTTokenTool = {
  name: "payware_authentication_create_jwt_token",
  description: "Create JWT token for payware API authentication according to official documentation",
  inputSchema: {
    type: "object",
    properties: {
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default."
      },
      privateKey: {
        type: "string",
        description: "RSA private key - accepts PEM format with/without headers or raw base64 content. Uses environment-specific private key as default."
      },
      requestBody: {
        type: "object",
        description: "Request body (for POST/PUT/PATCH requests that need contentSha256)"
      }
    },
    additionalProperties: false
  },
  
  async handler(args) {
    const {
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      requestBody
    } = args;

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set environment-specific private key variable.");
    }
    
    // Get key info for validation and user feedback
    const keyInfo = getKeyInfo(privateKey);
    
    try {
      const tokenData = createJWTToken(partnerId, privateKey, requestBody);
      
      // Add key format information to the response
      const keyFormatInfo = keyInfo.hasHeaders 
        ? `✅ Standard PEM format (${keyInfo.format})`
        : `🔧 Normalized from base64 content to PEM format`;
      
      const originalResponse = tokenData;
    
    return {
      content: [{
        type: "text",
        text: `🔑 **JWT Token Created Successfully (payware Specification)**

**🔧 Key Format:** ${keyFormatInfo}

**Token:**
\`\`\`
${tokenData.token}
\`\`\`

**Token Details:**
- Partner ID (iss): ${tokenData.partnerId}
- Audience (aud): ${tokenData.audience}
- Issued At (iat): ${tokenData.issuedAt}
- Algorithm: RS256
- Type: JWT
${tokenData.contentSha256 ? `- Content SHA-256: ${tokenData.contentSha256}` : '- Content SHA-256: Not included (no request body)'}

**JWT Structure (Decoded):**
**Header:**
\`\`\`json
{
  "alg": "RS256",
  "typ": "JWT"${tokenData.contentSha256 ? `,\n  "contentSha256": "${tokenData.contentSha256}"` : ''}
}
\`\`\`

**Payload:**
\`\`\`json
{
  "iss": "${tokenData.partnerId}",
  "aud": "https://payware.eu",
  "iat": ${Math.floor(Date.parse(tokenData.issuedAt) / 1000)}
}
\`\`\`

**Usage:**
Add these headers to your API requests:
\`\`\`
Authorization: Bearer ${tokenData.token}
Api-Version: 1
Content-Type: application/json
\`\`\`

**✅ Complies with payware Documentation:**
- ✅ Algorithm: RS256
- ✅ Type: JWT  
- ✅ Issuer: Your Partner ID
- ✅ Audience: https://payware.eu
- ✅ Issued At: Unix timestamp
${tokenData.contentSha256 ? '- ✅ Content SHA-256: Included for request body' : '- ℹ️ Content SHA-256: Not needed for GET requests'}

**📝 Private Key Formats Supported:**
- ✅ Full PEM format with headers/footers
- ✅ Base64 content only (headers added automatically)
- ✅ Mixed formats (normalized automatically)

## ⚠️ **CRITICAL AUTHENTICATION REQUIREMENTS**

### JSON Body Consistency Rule
${tokenData.contentSha256 ? `**Your contentSha256 (${tokenData.contentSha256}) MUST match the exact bytes sent in HTTP request.**

❌ **Common Error Causing ERR_INVALID_CONTENT_HASH:**
\`\`\`python
# Wrong - different serialization formats!
jwt_token = create_jwt(json.dumps(payload))  # One format
requests.post(url, json=payload)            # Different format!
\`\`\`

✅ **Correct Implementation:**
\`\`\`python
# Same serialization for both hash and HTTP body
json_body = json.dumps(payload, separators=(',', ':'))  # Compact format
jwt_token = create_jwt(json_body)
requests.post(url, data=json_body, headers=headers)
\`\`\`
` : '**No request body - No hash consistency concerns for GET requests.**'}

### Troubleshooting Authentication Errors

**ERR_INVALID_CONTENT_HASH** - Content hash mismatch:
- Cause: JWT contentSha256 doesn't match HTTP request body bytes
- Fix: Use identical JSON serialization for both hash calculation and HTTP request
- Common issue: \`requests.post(json=data)\` vs \`requests.post(data=json_string)\`

**ERR_INVALID_SIGNATURE** - JWT signature validation failed:
- Cause: Private key mismatch or malformed JWT
- Fix: Ensure your private key matches the public key registered with payware
- Check: JWT structure, algorithm (RS256), audience (https://payware.eu)

### Language-Specific Best Practices

**Python (requests library):**
\`\`\`python
import json
import requests

# CRITICAL: Use same serialization for both
json_body = json.dumps(payload, separators=(',', ':'))
jwt_token = create_jwt_token(json_body)
response = requests.post(url, data=json_body, headers={'Authorization': f'Bearer {jwt_token}'})
\`\`\`

**Node.js (axios library):**
\`\`\`javascript
const jsonBody = JSON.stringify(payload);
const jwtToken = createJWTToken(jsonBody);
const response = await axios.post(url, jsonBody, {headers: {'Authorization': \`Bearer \${jwtToken}\`}});
\`\`\`

**⚠️ Security Notes:**
- Token is valid for sandbox environment only
- Do not share or log this token
- Generate new token for each request with different body
- Ensure your public key is registered with payware
- **Critical:** Always use matching JSON serialization for SHA-256 hash and HTTP body`
      }]
    };
    } catch (error) {
      // Provide helpful error message based on the error type
      let errorMessage = `Failed to create JWT token: ${error.message}`;
      
      if (error.message.includes('key')) {
        errorMessage += `\n\n**Key Format Help:**\nYou can provide the private key in any of these formats:\n- Full PEM format with -----BEGIN/END----- headers\n- Just the base64 content (headers will be added automatically)\n- Current key info: ${keyInfo.format}`;
      }
      
      throw new Error(errorMessage);
    }
  }
};