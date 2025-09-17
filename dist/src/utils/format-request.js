/**
 * Format and validate requests for payware API with deterministic JSON serialization
 */

import { createMinimizedJSON } from '../core/utils/json-serializer.js';

/**
 * Format transaction request data
 * @param {Object} data - Raw transaction data
 * @returns {Object} Formatted and validated transaction data
 */
export function formatTransactionRequest(data) {
  const {
    type = 'PLAIN',
    amount,
    currency = 'EUR',
    reasonL1,
    reasonL2,
    callbackUrl,
    account,
    friendlyName,
    shop,
    timeToLive = 120,
    passbackParams
  } = data;
  
  // Validation
  const errors = [];
  
  // reasonL1 is required
  if (!reasonL1 || typeof reasonL1 !== 'string' || reasonL1.trim().length === 0) {
    errors.push('reasonL1 is required (transaction grounds description)');
  }
  
  if (reasonL1 && reasonL1.length > 100) {
    errors.push('reasonL1 cannot exceed 100 characters');
  }
  
  if (reasonL2 && reasonL2.length > 100) {
    errors.push('reasonL2 cannot exceed 100 characters');
  }
  
  // Amount validation (optional for flexible amounts)
  if (amount !== undefined && (typeof amount !== 'number' && typeof amount !== 'string')) {
    errors.push('Amount must be a number or string representing currency value');
  }
  
  if (amount !== undefined && parseFloat(amount) < 0) {
    errors.push('Amount must be non-negative currency value');
  }
  
  // Amount can be any positive value (limited by Java type implementation)
  
  if (!['PLAIN', 'QR', 'BARCODE'].includes(type)) {
    errors.push('Transaction type must be PLAIN, QR, or BARCODE');
  }
  
  // Currency validation - accept any 3-character ISO code
  if (!currency || typeof currency !== 'string' || !currency.match(/^[A-Z]{3}$/)) {
    errors.push('Currency must be a valid ISO 3-character code (e.g., EUR, USD, JPY)');
  }
  
  if (callbackUrl && !callbackUrl.match(/^https?:\/\/.+/)) {
    errors.push('Callback URL must be a valid HTTP/HTTPS URL');
  }
  
  if (account && account.length > 36) {
    errors.push('Account identifier cannot exceed 36 characters');
  }
  
  if (friendlyName && friendlyName.length > 100) {
    errors.push('Friendly name cannot exceed 100 characters');
  }
  
  if (shop && shop.length > 10) {
    errors.push('Shop code cannot exceed 10 characters');
  }
  
  if (timeToLive && (timeToLive < 60 || timeToLive > 600)) {
    errors.push('Time to live must be between 60 and 600 seconds');
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`);
  }
  
  // Format the request according to documentation structure
  const formattedRequest = {
    ...(account && { account }),
    ...(friendlyName && { friendlyName }),
    ...(shop && { shop }),
    ...(callbackUrl && { callbackUrl }),
    ...(passbackParams && { passbackParams }),
    trData: {
      amount: amount !== undefined ? amount.toString() : '0.00',
      currency,
      reasonL1,
      ...(reasonL2 && { reasonL2 })
    },
    trOptions: {
      type,
      timeToLive
    }
  };
  
  return {
    request: formattedRequest,
    validation: {
      valid: true,
      errors: [],
      warnings: []
    },
    formatted: true,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format API headers
 * @param {string} jwtToken - JWT authentication token
 * @param {string} signature - Request signature (optional)
 * @returns {Object} Formatted headers
 */
export function formatAPIHeaders(jwtToken, signature = null) {
  const headers = {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
    'Api-Version': '1',
    'Accept': 'application/json'
  };
  
  if (signature) {
    headers['X-Signature'] = signature;
  }
  
  return headers;
}

/**
 * Format curl command for API testing
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} headers - Request headers
 * @param {Object} body - Request body (optional)
 * @returns {string} Formatted curl command
 */
export function formatCurlCommand(method, endpoint, headers, body = null) {
  let curl = `curl -X ${method.toUpperCase()} "${endpoint}"`;
  
  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    curl += ` \\\n  -H "${key}: ${value}"`;
  });
  
  // Add body if present
  if (body) {
    curl += ` \\\n  -d '${JSON.stringify(body, null, 2)}'`;
  }
  
  return curl;
}

/**
 * Format request tool implementation
 */
export const formatRequestTool = {
  name: "payware_utils_format_request",
  description: "Format and validate payware API requests with proper structure and headers",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["transaction", "headers", "curl"],
        description: "Type of formatting to perform"
      },
      data: {
        type: "object",
        description: "Data to format (structure depends on type)"
      },
      jwtToken: {
        type: "string",
        description: "JWT token for header formatting"
      },
      signature: {
        type: "string",
        description: "Request signature (optional)"
      },
      endpoint: {
        type: "string",
        description: "API endpoint URL (for curl formatting)"
      },
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE"],
        description: "HTTP method (for curl formatting)"
      }
    },
    required: ["type"],
    additionalProperties: false
  },
  
  async handler(args) {
    const { type, data = {}, jwtToken, signature, endpoint, method = 'POST' } = args;
    
    switch (type) {
      case 'transaction': {
        if (!data.amount) {
          throw new Error("Amount is required for transaction formatting");
        }
        
        const formatted = formatTransactionRequest(data);
        
        const minimizedJSON = createMinimizedJSON(formatted.request);
        
        return {
          content: [{
            type: "text",
            text: `📋 **Transaction Request Formatted**

**Formatted Request (Pretty):**
\`\`\`json
${JSON.stringify(formatted.request, null, 2)}
\`\`\`

**Minimized JSON (API Format):**
\`\`\`json
${minimizedJSON}
\`\`\`

**Validation Result:**
- ✅ Valid: ${formatted.validation.valid}
- Errors: ${formatted.validation.errors.length}
- Warnings: ${formatted.validation.warnings.length}

**Request Details:**
- Type: ${formatted.request.trOptions.type}
- Amount: ${formatted.request.trData.amount} ${formatted.request.trData.currency}
- Description: ${formatted.request.trData.reasonL1}
${formatted.request.trData.reasonL2 ? `- Description L2: ${formatted.request.trData.reasonL2}` : ''}
${formatted.request.callbackUrl ? `- Callback URL: ${formatted.request.callbackUrl}` : ''}

**Usage:**
Use the minimized JSON format for API calls to ensure MD5 consistency:
\`\`\`javascript
const response = await fetch('https://sandbox.payware.eu/api/transactions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: '${minimizedJSON}'  // Use pre-minimized string for MD5 consistency
});
\`\`\`

**⚠️ Important:** Always use the minimized JSON format to ensure the MD5 hash in your JWT token matches the request body.

**Formatted:** ${formatted.formatted}
**Timestamp:** ${formatted.timestamp}`
          }]
        };
      }
      
      case 'headers': {
        if (!jwtToken) {
          throw new Error("JWT token is required for header formatting");
        }
        
        const headers = formatAPIHeaders(jwtToken, signature);
        
        return {
          content: [{
            type: "text",
            text: `📋 **API Headers Formatted**

**Headers:**
\`\`\`json
${JSON.stringify(headers, null, 2)}
\`\`\`

**Header Breakdown:**
- **Authorization**: Bearer token for authentication
- **Content-Type**: JSON content type
- **Accept**: Expects JSON response
${signature ? '- **X-Signature**: Request signature for additional security' : ''}

**Usage in JavaScript:**
\`\`\`javascript
const headers = ${JSON.stringify(headers, null, 2)};

fetch(url, { headers, ...options });
\`\`\`

**Usage in Python:**
\`\`\`python
headers = ${JSON.stringify(headers, null, 2).replace(/"/g, "'")}

requests.post(url, headers=headers, json=data)
\`\`\`

**Usage in cURL:**
\`\`\`bash
${Object.entries(headers).map(([key, value]) => `curl -H "${key}: ${value}"`).join(' \\\n')} \\
  https://sandbox.payware.eu/api/transactions
\`\`\``
          }]
        };
      }
      
      case 'curl': {
        if (!endpoint) {
          throw new Error("Endpoint is required for curl formatting");
        }
        
        if (!jwtToken) {
          throw new Error("JWT token is required for curl formatting");
        }
        
        const headers = formatAPIHeaders(jwtToken, signature);
        const curl = formatCurlCommand(method, endpoint, headers, data);
        
        return {
          content: [{
            type: "text",
            text: `💻 **cURL Command Generated**

**Command:**
\`\`\`bash
${curl}
\`\`\`

**Command Breakdown:**
- Method: ${method.toUpperCase()}
- Endpoint: ${endpoint}
- Headers: ${Object.keys(headers).length} headers included
${data && Object.keys(data).length > 0 ? `- Body: JSON payload included` : '- Body: No payload'}

**Usage:**
1. Copy the command above
2. Paste it into your terminal
3. Execute to test the API call directly
4. Modify parameters as needed

**Response:**
The command will return the API response directly in your terminal, including:
- HTTP status code
- Response headers  
- JSON response body
- Any error messages

**Tips:**
- Add \`-v\` flag for verbose output with headers
- Add \`-i\` flag to include response headers
- Use \`-o filename\` to save response to file`
          }]
        };
      }
      
      default:
        throw new Error(`Unknown formatting type: ${type}`);
    }
  }
};