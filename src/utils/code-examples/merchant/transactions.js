/**
 * Merchant transaction examples for all operations
 */

import { PythonGenerator, NodeJSGenerator } from '../common/utils-examples.js';
import { CommonTemplates } from '../common/helpers.js';

/**
 * Merchant transaction operations
 */
export const MerchantTransactionOperations = {
  create_transaction: {
    description: 'Create a new payment transaction',
    endpoint: '/transactions',
    method: 'POST',
    sampleBody: {
      trData: {
        amount: '25.50',
        currency: 'EUR',
        reasonL1: 'Product purchase',
        reasonL2: 'Online store order #12345'
      },
      trOptions: {
        type: 'QR',
        timeToLive: 300
      }
    }
  },

  get_transaction_status: {
    description: 'Get the current status of a transaction',
    endpoint: '/transactions/{id}',
    method: 'GET',
    sampleBody: {}
  },

  cancel_transaction: {
    description: 'Cancel an active transaction',
    endpoint: '/transactions/{id}',
    method: 'PATCH',
    sampleBody: {
      status: 'CANCELLED',
      statusMessage: 'Customer requested cancellation'
    }
  },

  process_transaction: {
    description: 'Process a transaction as merchant',
    endpoint: '/transactions/{id}',
    method: 'POST',
    sampleBody: {
      account: 'MERCHANT_ACCOUNT_123',
      friendlyName: 'My Store',
      paymentMethod: 'A2A'  // Optional: A2A, CARD_FUNDED, BNPL, INSTANT_CREDIT
    }
  },

  get_transaction_history: {
    description: 'Get transaction history',
    endpoint: '/transactions/{id}/history',
    method: 'GET',
    sampleBody: {}
  },

  simulate_callback: {
    description: 'Simulate a transaction callback for testing',
    endpoint: '/transactions/{id}/callback',
    method: 'POST',
    sampleBody: {
      status: 'PROCESSED',
      timestamp: new Date().toISOString()
    }
  }
};

/**
 * Generate Python examples for merchant transactions
 */
export function generateMerchantTransactionPython(operation, params = {}) {
  const generator = new PythonGenerator(params.framework);
  const operationConfig = MerchantTransactionOperations[operation];

  if (!operationConfig) {
    throw new Error(`Unknown operation: ${operation}`);
  }

  // Customize request body with parameters
  const customBody = { ...operationConfig.sampleBody };
  if (params.amount) customBody.trData = { ...customBody.trData, amount: params.amount };
  if (params.currency) customBody.trData = { ...customBody.trData, currency: params.currency };
  if (params.reasonL1) customBody.trData = { ...customBody.trData, reasonL1: params.reasonL1 };

  const sections = [];

  // Header and description
  sections.push(`"""
${operationConfig.description}

This example demonstrates how to ${operationConfig.description.toLowerCase()} using the payware API.
Partner Type: Merchant
Operation: ${operation}
Method: ${operationConfig.method}
Endpoint: ${operationConfig.endpoint}
"""

# Required dependencies:
# pip install requests pyjwt cryptography python-dotenv

import requests
import jwt
import json
import hashlib
import base64
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()`);

  // Environment setup
  sections.push(`# Environment Configuration
def load_merchant_config():
    """Load merchant configuration from environment"""
    config = {
        'partner_id': os.getenv('PAYWARE_PARTNER_ID'),
        'sandbox_key_path': os.getenv('PAYWARE_SANDBOX_PRIVATE_KEY_PATH'),
        'production_key_path': os.getenv('PAYWARE_PRODUCTION_PRIVATE_KEY_PATH'),
        'sandbox_url': os.getenv('PAYWARE_SANDBOX_URL', 'https://sandbox.payware.eu/api'),
        'production_url': os.getenv('PAYWARE_PRODUCTION_URL', 'https://api.payware.eu/api')
    }

    # Validate required configuration
    if not config['partner_id']:
        raise ValueError("PAYWARE_PARTNER_ID environment variable is required")

    return config`);

  // Authentication functions
  sections.push(`# Authentication Functions
def create_jwt_token(request_body=None, use_sandbox=True):
    """Create JWT token for payware API authentication"""
    config = load_merchant_config()

    # Get private key path based on environment
    private_key_path = config['sandbox_key_path'] if use_sandbox else config['production_key_path']
    if not private_key_path:
        env_var = 'PAYWARE_SANDBOX_PRIVATE_KEY_PATH' if use_sandbox else 'PAYWARE_PRODUCTION_PRIVATE_KEY_PATH'
        raise ValueError(f"{env_var} environment variable is required")

    # Load private key
    with open(private_key_path, 'r') as f:
        private_key = f.read()

    # Create JWT header
    header = {
        'alg': 'RS256',
        'typ': 'JWT'
    }

    # Add content SHA-256 for requests with body
    body_string = None
    if request_body:
        body_string = create_minimized_json(request_body)
        content_sha256 = base64.b64encode(
            hashlib.sha256(body_string.encode('utf-8')).digest()
        ).decode('utf-8')
        header['contentSha256'] = content_sha256

    # Create JWT payload
    payload = {
        'iss': config['partner_id'],
        'aud': 'https://payware.eu',
        'iat': int(datetime.utcnow().timestamp())
    }

    # Create token
    token = jwt.encode(payload, private_key, algorithm='RS256', headers=header)
    return token, body_string

def create_minimized_json(data):
    """Create deterministic minimized JSON for SHA-256 calculation"""
    def sort_dict(obj):
        if isinstance(obj, dict):
            return {k: sort_dict(v) for k, v in sorted(obj.items())}
        elif isinstance(obj, list):
            return [sort_dict(item) for item in obj]
        else:
            return obj

    sorted_data = sort_dict(data)
    return json.dumps(sorted_data, separators=(',', ':'))

def get_api_headers(token):
    """Get standard API headers"""
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Api-Version': '1'
    }`);

  // Main operation function
  const needsId = operationConfig.endpoint.includes('{id}');
  const hasBody = operationConfig.method !== 'GET' && Object.keys(operationConfig.sampleBody).length > 0;

  const paramList = ['use_sandbox=True'];
  if (needsId) {
    paramList.unshift('transaction_id');
  }

  // Add custom parameters for specific operations
  if (operation === 'create_transaction') {
    paramList.splice(-1, 0, 'amount="25.50"', 'currency="EUR"', 'reason_l1="Product purchase"', 'reason_l2=None');
  }

  const functionName = operation;
  const endpoint = operationConfig.endpoint.replace('{id}', '{transaction_id}');

  sections.push(`# Main Operation
def ${functionName}(${paramList.join(', ')}):
    """${operationConfig.description}"""

    try:
        config = load_merchant_config()
        base_url = config['sandbox_url'] if use_sandbox else config['production_url']

        ${hasBody ? `# Prepare request body
        request_body = ${JSON.stringify(customBody, null, 8).replace(/"/g, "'")}

        ${operation === 'create_transaction' ? `# Customize with parameters
        if amount:
            request_body['trData']['amount'] = amount
        if currency:
            request_body['trData']['currency'] = currency
        if reason_l1:
            request_body['trData']['reasonL1'] = reason_l1
        if reason_l2:
            request_body['trData']['reasonL2'] = reason_l2` : ''}

        # Create JWT token with body hash
        token, body_string = create_jwt_token(request_body, use_sandbox)
        headers = get_api_headers(token)

        # Make API request
        url = f"{base_url}${endpoint}"${needsId ? `.format(transaction_id=transaction_id)` : ''}
        response = requests.${operationConfig.method.toLowerCase()}(
            url,
            data=body_string,
            headers=headers
        )` : `# Create JWT token for GET request
        token, _ = create_jwt_token(None, use_sandbox)
        headers = get_api_headers(token)

        # Make API request
        url = f"{base_url}${endpoint}"${needsId ? `.format(transaction_id=transaction_id)` : ''}
        response = requests.${operationConfig.method.toLowerCase()}(
            url,
            headers=headers
        )`}

        # Handle response
        if response.status_code in [200, 201]:
            result = response.json()
            return {
                'success': True,
                'data': result,
                'request_id': response.headers.get('x-request-id'),
                'timestamp': datetime.utcnow().isoformat()
            }
        else:
            return {
                'success': False,
                'error': {
                    'status': response.status_code,
                    'message': response.text,
                    'details': response.json() if response.headers.get('content-type', '').startswith('application/json') else None
                },
                'timestamp': datetime.utcnow().isoformat()
            }

    except Exception as e:
        return {
            'success': False,
            'error': {
                'message': str(e),
                'type': type(e).__name__
            },
            'timestamp': datetime.utcnow().isoformat()
        }`);

  // Error handling
  sections.push(`# Error Handling
def handle_payware_error(error_response):
    """Handle common payware API errors"""
    status = error_response.get('status', 0)
    message = error_response.get('message', 'Unknown error')

    error_messages = {
        400: f"Bad Request: {message}",
        401: "Authentication failed - check your partner ID and private key",
        403: "Forbidden - insufficient permissions",
        404: "Resource not found",
        409: "Conflict - resource already exists or invalid state",
        429: "Rate limit exceeded - please retry later",
        500: "Internal server error - please try again",
        502: "Bad gateway - service temporarily unavailable",
        503: "Service unavailable - please retry later"
    }

    return error_messages.get(status, f"API Error {status}: {message}")`);

  // Example usage
  const exampleParams = needsId ? "'pw12345678'" : '';
  sections.push(`# Example Usage
if __name__ == "__main__":
    print("=== Merchant ${operation.replace('_', ' ').title()} Example ===\\n")

    try:
        # Execute the operation
        result = ${functionName}(${exampleParams})

        if result['success']:
            print("✅ Operation successful!")
            print(f"Request ID: {result.get('request_id', 'N/A')}")
            print("Response Data:")
            print(json.dumps(result['data'], indent=2))
        else:
            print("❌ Operation failed!")
            error_message = handle_payware_error(result['error'])
            print(f"Error: {error_message}")

            if result['error'].get('details'):
                print("Error Details:")
                print(json.dumps(result['error']['details'], indent=2))

    except Exception as e:
        print(f"❌ Unexpected error: {e}")

    print(f"\\nTimestamp: {datetime.utcnow().isoformat()}")
    print("\\n" + "="*50)`);

  return sections.join('\n\n');
}

/**
 * Generate Node.js examples for merchant transactions
 */
export function generateMerchantTransactionNodeJS(operation, params = {}) {
  const generator = new NodeJSGenerator(params.framework);
  const operationConfig = MerchantTransactionOperations[operation];

  if (!operationConfig) {
    throw new Error(`Unknown operation: ${operation}`);
  }

  const sections = [];

  // Header and description
  sections.push(`/**
 * ${operationConfig.description}
 *
 * This example demonstrates how to ${operationConfig.description.toLowerCase()} using the payware API.
 * Partner Type: Merchant
 * Operation: ${operation}
 * Method: ${operationConfig.method}
 * Endpoint: ${operationConfig.endpoint}
 */

// Required dependencies:
// npm install axios jsonwebtoken crypto fs dotenv

const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();`);

  // Configuration
  sections.push(`// Configuration
function loadMerchantConfig() {
  const config = {
    partnerId: process.env.PAYWARE_PARTNER_ID,
    sandboxKeyPath: process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH,
    productionKeyPath: process.env.PAYWARE_PRODUCTION_PRIVATE_KEY_PATH,
    sandboxUrl: process.env.PAYWARE_SANDBOX_URL || 'https://sandbox.payware.eu/api',
    productionUrl: process.env.PAYWARE_PRODUCTION_URL || 'https://api.payware.eu/api'
  };

  // Validate required configuration
  if (!config.partnerId) {
    throw new Error('PAYWARE_PARTNER_ID environment variable is required');
  }

  return config;
}`);

  // Authentication functions
  sections.push(`// Authentication Functions
function createJWTToken(requestBody = null, useSandbox = true) {
  const config = loadMerchantConfig();

  // Get private key path based on environment
  const privateKeyPath = useSandbox ? config.sandboxKeyPath : config.productionKeyPath;
  if (!privateKeyPath) {
    const envVar = useSandbox ? 'PAYWARE_SANDBOX_PRIVATE_KEY_PATH' : 'PAYWARE_PRODUCTION_PRIVATE_KEY_PATH';
    throw new Error(\`\${envVar} environment variable is required\`);
  }

  // Load private key
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Add content SHA-256 for requests with body
  let bodyString = null;
  if (requestBody) {
    bodyString = createMinimizedJSON(requestBody);
    const contentSha256 = crypto
      .createHash('sha256')
      .update(bodyString, 'utf8')
      .digest('base64');
    header.contentSha256 = contentSha256;
  }

  // Create JWT payload
  const payload = {
    iss: config.partnerId,
    aud: 'https://payware.eu',
    iat: Math.floor(Date.now() / 1000)
  };

  // Create token
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header
  });

  return { token, bodyString };
}

function createMinimizedJSON(data) {
  // Sort object keys recursively for deterministic output
  function sortObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => sortObject(item));
    } else if (obj !== null && typeof obj === 'object') {
      const sorted = {};
      Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObject(obj[key]);
      });
      return sorted;
    }
    return obj;
  }

  const sortedData = sortObject(data);
  return JSON.stringify(sortedData);
}

function getAPIHeaders(token) {
  return {
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };
}`);

  // Main operation function
  const needsId = operationConfig.endpoint.includes('{id}');
  const hasBody = operationConfig.method !== 'GET' && Object.keys(operationConfig.sampleBody).length > 0;

  const paramList = ['useSandbox = true'];
  if (needsId) {
    paramList.unshift('transactionId');
  }

  // Add custom parameters for specific operations
  if (operation === 'create_transaction') {
    paramList.splice(-1, 0, 'amount = "25.50"', 'currency = "EUR"', 'reasonL1 = "Product purchase"', 'reasonL2 = null');
  }

  const endpoint = operationConfig.endpoint.replace('{id}', '${transactionId}');

  sections.push(`// Main Operation
async function ${operation}(${paramList.join(', ')}) {
  /**
   * ${operationConfig.description}
   */

  try {
    const config = loadMerchantConfig();
    const baseUrl = useSandbox ? config.sandboxUrl : config.productionUrl;

    ${hasBody ? `// Prepare request body
    const requestBody = ${JSON.stringify(operationConfig.sampleBody, null, 4)};

    ${operation === 'create_transaction' ? `// Customize with parameters
    if (amount) requestBody.trData.amount = amount;
    if (currency) requestBody.trData.currency = currency;
    if (reasonL1) requestBody.trData.reasonL1 = reasonL1;
    if (reasonL2) requestBody.trData.reasonL2 = reasonL2;` : ''}

    // Create JWT token with body hash
    const { token, bodyString } = createJWTToken(requestBody, useSandbox);
    const headers = getAPIHeaders(token);

    // Make API request
    const url = \`\${baseUrl}${endpoint}\`;
    const response = await axios.${operationConfig.method.toLowerCase()}(
      url,
      bodyString,
      {
        headers,
        transformRequest: [(data) => data]
      }
    );` : `// Create JWT token for GET request
    const { token } = createJWTToken(null, useSandbox);
    const headers = getAPIHeaders(token);

    // Make API request
    const url = \`\${baseUrl}${endpoint}\`;
    const response = await axios.${operationConfig.method.toLowerCase()}(
      url,
      { headers }
    );`}

    // Handle successful response
    return {
      success: true,
      data: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    // Handle errors
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        details: error.response?.data
      },
      timestamp: new Date().toISOString()
    };
  }
}`);

  // Error handling
  sections.push(`// Error Handling
function handlePaywareError(errorResponse) {
  const status = errorResponse.status || 0;
  const message = errorResponse.message || 'Unknown error';

  const errorMessages = {
    400: \`Bad Request: \${message}\`,
    401: 'Authentication failed - check your partner ID and private key',
    403: 'Forbidden - insufficient permissions',
    404: 'Resource not found',
    409: 'Conflict - resource already exists or invalid state',
    429: 'Rate limit exceeded - please retry later',
    500: 'Internal server error - please try again',
    502: 'Bad gateway - service temporarily unavailable',
    503: 'Service unavailable - please retry later'
  };

  return errorMessages[status] || \`API Error \${status}: \${message}\`;
}`);

  // Example usage
  const exampleParams = needsId ? "'pw12345678'" : '';
  sections.push(`// Example Usage
async function main() {
  console.log('=== Merchant ${operation.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase())} Example ===\\n');

  try {
    // Execute the operation
    const result = await ${operation}(${exampleParams});

    if (result.success) {
      console.log('✅ Operation successful!');
      console.log(\`Request ID: \${result.requestId || 'N/A'}\`);
      console.log('Response Data:');
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log('❌ Operation failed!');
      const errorMessage = handlePaywareError(result.error);
      console.log(\`Error: \${errorMessage}\`);

      if (result.error.details) {
        console.log('Error Details:');
        console.log(JSON.stringify(result.error.details, null, 2));
      }
    }

  } catch (error) {
    console.error(\`❌ Unexpected error: \${error.message}\`);
  }

  console.log(\`\\nTimestamp: \${new Date().toISOString()}\`);
  console.log('\\n' + '='.repeat(50));
}

// Run the example
main();`);

  return sections.join('\n\n');
}

/**
 * Export all merchant transaction examples
 */
export const MerchantTransactionExamples = {
  operations: MerchantTransactionOperations,
  generators: {
    python: generateMerchantTransactionPython,
    nodejs: generateMerchantTransactionNodeJS,
    javascript: generateMerchantTransactionNodeJS
  }
};