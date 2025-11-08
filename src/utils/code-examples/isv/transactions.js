/**
 * ISV transaction examples for all operations
 */

import { PythonGenerator, NodeJSGenerator } from '../common/utils-examples.js';
import { CommonTemplates } from '../common/helpers.js';

/**
 * ISV transaction operations
 */
export const ISVTransactionOperations = {
  create_transaction: {
    description: 'Create a transaction on behalf of a merchant (ISV operation)',
    endpoint: '/transactions',
    method: 'POST',
    requiresOAuth: true,
    sampleBody: {
      trData: {
        amount: '50.00',
        currency: 'EUR',
        reasonL1: 'ISV managed transaction',
        reasonL2: 'Created on behalf of merchant'
      },
      trOptions: {
        type: 'QR',
        timeToLive: 600
      }
    }
  },

  get_transaction_status: {
    description: 'Get transaction status on behalf of merchant',
    endpoint: '/transactions/{id}',
    method: 'GET',
    requiresOAuth: true,
    sampleBody: {}
  },

  cancel_transaction: {
    description: 'Cancel transaction on behalf of merchant',
    endpoint: '/transactions/{id}',
    method: 'PATCH',
    requiresOAuth: true,
    sampleBody: {
      status: 'CANCELLED',
      statusMessage: 'ISV initiated cancellation'
    }
  },

  process_transaction: {
    description: 'Process transaction on behalf of merchant',
    endpoint: '/transactions/{id}',
    method: 'POST',
    requiresOAuth: true,
    sampleBody: {
      account: 'MERCHANT_ACCOUNT_123',
      friendlyName: 'Merchant Name via ISV'
    }
  },

  get_transaction_history: {
    description: 'Get transaction history for merchant',
    endpoint: '/transactions/{id}/history',
    method: 'GET',
    requiresOAuth: true,
    sampleBody: {}
  },

  simulate_callback: {
    description: 'Simulate callback for merchant transaction',
    endpoint: '/transactions/{id}/callback',
    method: 'POST',
    requiresOAuth: true,
    sampleBody: {
      status: 'PROCESSED',
      timestamp: new Date().toISOString()
    }
  }
};

/**
 * Generate Python examples for ISV transactions
 */
export function generateISVTransactionPython(operation, params = {}) {
  const operationConfig = ISVTransactionOperations[operation];

  if (!operationConfig) {
    throw new Error(`Unknown operation: ${operation}`);
  }

  const sections = [];

  // Header and description
  sections.push(`"""
${operationConfig.description}

This example demonstrates ISV operations for managing transactions on behalf of merchants.
Partner Type: ISV (Independent Software Vendor)
Operation: ${operation}
Method: ${operationConfig.method}
Endpoint: ${operationConfig.endpoint}
Authentication: ISV JWT + OAuth2 Token
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
  sections.push(`# ISV Environment Configuration
def load_isv_config():
    """Load ISV configuration from environment"""
    config = {
        'isv_partner_id': os.getenv('PAYWARE_PARTNER_ID'),
        'sandbox_key_path': os.getenv('PAYWARE_SANDBOX_PRIVATE_KEY_PATH'),
        'production_key_path': os.getenv('PAYWARE_PRODUCTION_PRIVATE_KEY_PATH'),
        'oauth_client_id': os.getenv('PAYWARE_OAUTH_CLIENT_ID'),
        'oauth_client_secret': os.getenv('PAYWARE_OAUTH_CLIENT_SECRET'),
        'default_merchant_id': os.getenv('PAYWARE_DEFAULT_MERCHANT_ID'),
        'sandbox_url': os.getenv('PAYWARE_SANDBOX_URL', 'https://sandbox.payware.eu/api'),
        'production_url': os.getenv('PAYWARE_PRODUCTION_URL', 'https://api.payware.eu/api')
    }

    # Validate required configuration
    required_vars = ['isv_partner_id', 'oauth_client_id', 'oauth_client_secret']
    for var in required_vars:
        if not config[var]:
            env_var = {
                'isv_partner_id': 'PAYWARE_PARTNER_ID',
                'oauth_client_id': 'PAYWARE_OAUTH_CLIENT_ID',
                'oauth_client_secret': 'PAYWARE_OAUTH_CLIENT_SECRET'
            }[var]
            raise ValueError(f"{env_var} environment variable is required for ISV operations")

    return config`);

  // OAuth2 functions
  sections.push(`# OAuth2 Authentication for ISV
def get_oauth2_token(merchant_partner_id, use_sandbox=True):
    """Get OAuth2 token for accessing merchant resources"""
    config = load_isv_config()
    base_url = config['sandbox_url'] if use_sandbox else config['production_url']

    # Prepare OAuth2 token request
    token_data = {
        'grant_type': 'client_credentials',
        'client_id': config['oauth_client_id'],
        'client_secret': config['oauth_client_secret'],
        'scope': f'merchant:{merchant_partner_id}'
    }

    try:
        response = requests.post(
            f"{base_url}/oauth2/token",
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )

        if response.status_code == 200:
            token_response = response.json()
            return {
                'access_token': token_response['access_token'],
                'token_type': token_response['token_type'],
                'expires_in': token_response.get('expires_in'),
                'scope': token_response.get('scope')
            }
        else:
            raise Exception(f"OAuth2 token request failed: {response.status_code} - {response.text}")

    except Exception as e:
        raise Exception(f"OAuth2 authentication error: {str(e)}")

def create_isv_jwt_token(merchant_partner_id, oauth2_token, request_body=None, use_sandbox=True):
    """Create ISV JWT token with OAuth2 token for merchant access"""
    config = load_isv_config()

    # Get private key path based on environment
    private_key_path = config['sandbox_key_path'] if use_sandbox else config['production_key_path']
    if not private_key_path:
        env_var = 'PAYWARE_SANDBOX_PRIVATE_KEY_PATH' if use_sandbox else 'PAYWARE_PRODUCTION_PRIVATE_KEY_PATH'
        raise ValueError(f"{env_var} environment variable is required")

    # Load ISV private key
    with open(private_key_path, 'r') as f:
        private_key = f.read()

    # Create JWT header
    header = {
        'alg': 'RS256',
        'typ': 'JWT'
    }

    # Add content MD5 for requests with body
    body_string = None
    if request_body:
        body_string = create_minimized_json(request_body)
        content_md5 = base64.b64encode(
            hashlib.md5(body_string.encode('utf-8')).digest()
        ).decode('utf-8')
        header['contentMd5'] = content_md5

    # Create ISV JWT payload with OAuth2 token
    payload = {
        'iss': config['isv_partner_id'],      # ISV Partner ID
        'aud': merchant_partner_id,           # Target Merchant ID
        'sub': oauth2_token,                  # OAuth2 access token
        'iat': int(datetime.utcnow().timestamp())
    }

    # Create token
    token = jwt.encode(payload, private_key, algorithm='RS256', headers=header)
    return token, body_string

def create_minimized_json(data):
    """Create deterministic minimized JSON for MD5 calculation"""
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

  const paramList = ['merchant_partner_id', 'use_sandbox=True'];
  if (needsId) {
    paramList.splice(1, 0, 'transaction_id');
  }

  // Add custom parameters for specific operations
  if (operation === 'create_transaction') {
    paramList.splice(-1, 0, 'amount="50.00"', 'currency="EUR"', 'reason_l1="ISV transaction"', 'reason_l2=None');
  }

  const endpoint = operationConfig.endpoint.replace('{id}', '{transaction_id}');

  sections.push(`# Main ISV Operation
def ${operation}(${paramList.join(', ')}):
    """${operationConfig.description}"""

    try:
        config = load_isv_config()
        base_url = config['sandbox_url'] if use_sandbox else config['production_url']

        # Step 1: Get OAuth2 token for merchant access
        print(f"🔐 Getting OAuth2 token for merchant: {merchant_partner_id}")
        oauth2_response = get_oauth2_token(merchant_partner_id, use_sandbox)
        oauth2_token = oauth2_response['access_token']
        print(f"✅ OAuth2 token acquired (expires in: {oauth2_response.get('expires_in', 'unknown')} seconds)")

        ${hasBody ? `# Step 2: Prepare request body
        request_body = ${JSON.stringify(operationConfig.sampleBody, null, 8).replace(/"/g, "'")}

        ${operation === 'create_transaction' ? `# Customize with parameters
        if amount:
            request_body['trData']['amount'] = amount
        if currency:
            request_body['trData']['currency'] = currency
        if reason_l1:
            request_body['trData']['reasonL1'] = reason_l1
        if reason_l2:
            request_body['trData']['reasonL2'] = reason_l2` : ''}

        # Step 3: Create ISV JWT token with OAuth2 token
        print("🔐 Creating ISV JWT token with OAuth2 authentication")
        token, body_string = create_isv_jwt_token(
            merchant_partner_id,
            oauth2_token,
            request_body,
            use_sandbox
        )
        headers = get_api_headers(token)

        # Step 4: Make API request
        url = f"{base_url}${endpoint}"${needsId ? `.format(transaction_id=transaction_id)` : ''}
        print(f"📡 Making ${operationConfig.method} request to: {url}")
        response = requests.${operationConfig.method.toLowerCase()}(
            url,
            data=body_string,
            headers=headers
        )` : `# Step 2: Create ISV JWT token with OAuth2 token
        print("🔐 Creating ISV JWT token with OAuth2 authentication")
        token, _ = create_isv_jwt_token(
            merchant_partner_id,
            oauth2_token,
            None,
            use_sandbox
        )
        headers = get_api_headers(token)

        # Step 3: Make API request
        url = f"{base_url}${endpoint}"${needsId ? `.format(transaction_id=transaction_id)` : ''}
        print(f"📡 Making ${operationConfig.method} request to: {url}")
        response = requests.${operationConfig.method.toLowerCase()}(
            url,
            headers=headers
        )`}

        # Step ${hasBody ? '5' : '4'}: Handle response
        if response.status_code in [200, 201]:
            result = response.json()
            return {
                'success': True,
                'data': result,
                'merchant_partner_id': merchant_partner_id,
                'oauth2_info': {
                    'token_type': oauth2_response['token_type'],
                    'scope': oauth2_response.get('scope'),
                    'expires_in': oauth2_response.get('expires_in')
                },
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
                'merchant_partner_id': merchant_partner_id,
                'timestamp': datetime.utcnow().isoformat()
            }

    except Exception as e:
        return {
            'success': False,
            'error': {
                'message': str(e),
                'type': type(e).__name__
            },
            'merchant_partner_id': merchant_partner_id,
            'timestamp': datetime.utcnow().isoformat()
        }`);

  // Error handling
  sections.push(`# ISV Error Handling
def handle_isv_error(error_response):
    """Handle ISV-specific API errors"""
    status = error_response.get('status', 0)
    message = error_response.get('message', 'Unknown error')

    isv_error_messages = {
        400: f"Bad Request: {message}",
        401: "Authentication failed - check ISV credentials and OAuth2 setup",
        403: "Forbidden - ISV may not have permission for this merchant",
        404: "Resource not found",
        409: "Conflict - resource already exists or invalid state",
        429: "Rate limit exceeded - please retry later",
        500: "Internal server error - please try again"
    }

    base_message = isv_error_messages.get(status, f"API Error {status}: {message}")

    # Add ISV-specific guidance
    if status == 401:
        base_message += "\\n💡 ISV Troubleshooting:"
        base_message += "\\n   - Verify PAYWARE_PARTNER_ID is your ISV partner ID"
        base_message += "\\n   - Check OAuth2 client credentials"
        base_message += "\\n   - Ensure merchant has granted access to your ISV"
    elif status == 403:
        base_message += "\\n💡 ISV Authorization:"
        base_message += "\\n   - Merchant may need to authorize your ISV application"
        base_message += "\\n   - Check OAuth2 scope permissions"
        base_message += "\\n   - Verify merchant partner ID is correct"

    return base_message`);

  // Example usage
  const exampleParams = needsId ? '"MERCHANT123", "pw12345678"' : '"MERCHANT123"';
  sections.push(`# Example Usage
if __name__ == "__main__":
    print("=== ISV ${operation.replace('_', ' ').title()} Example ===\\n")

    # Example merchant partner ID (replace with actual merchant ID)
    merchant_id = "MERCHANT123"

    try:
        # Execute the ISV operation
        result = ${operation}(${exampleParams})

        if result['success']:
            print("✅ ISV operation successful!")
            print(f"🏢 Merchant: {result['merchant_partner_id']}")
            print(f"🔐 OAuth2 Scope: {result['oauth2_info']['scope']}")
            print(f"📋 Request ID: {result.get('request_id', 'N/A')}")
            print("\\n📊 Response Data:")
            print(json.dumps(result['data'], indent=2))
        else:
            print("❌ ISV operation failed!")
            print(f"🏢 Merchant: {result['merchant_partner_id']}")
            error_message = handle_isv_error(result['error'])
            print(f"❌ Error: {error_message}")

            if result['error'].get('details'):
                print("\\n📋 Error Details:")
                print(json.dumps(result['error']['details'], indent=2))

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        print("\\n💡 Common Issues:")
        print("   - Check all ISV environment variables are set")
        print("   - Verify merchant has authorized your ISV application")
        print("   - Ensure OAuth2 credentials are correct")

    print(f"\\nTimestamp: {datetime.utcnow().isoformat()}")
    print("\\n" + "="*60)`);

  return sections.join('\n\n');
}

/**
 * Generate Node.js examples for ISV transactions
 */
export function generateISVTransactionNodeJS(operation, params = {}) {
  const operationConfig = ISVTransactionOperations[operation];

  if (!operationConfig) {
    throw new Error(`Unknown operation: ${operation}`);
  }

  const sections = [];

  // Header and description
  sections.push(`/**
 * ${operationConfig.description}
 *
 * This example demonstrates ISV operations for managing transactions on behalf of merchants.
 * Partner Type: ISV (Independent Software Vendor)
 * Operation: ${operation}
 * Method: ${operationConfig.method}
 * Endpoint: ${operationConfig.endpoint}
 * Authentication: ISV JWT + OAuth2 Token
 */

// Required dependencies:
// npm install axios jsonwebtoken crypto fs dotenv

const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();`);

  // Configuration
  sections.push(`// ISV Configuration
function loadISVConfig() {
  const config = {
    isvPartnerId: process.env.PAYWARE_PARTNER_ID,
    sandboxKeyPath: process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH,
    productionKeyPath: process.env.PAYWARE_PRODUCTION_PRIVATE_KEY_PATH,
    oauthClientId: process.env.PAYWARE_OAUTH_CLIENT_ID,
    oauthClientSecret: process.env.PAYWARE_OAUTH_CLIENT_SECRET,
    defaultMerchantId: process.env.PAYWARE_DEFAULT_MERCHANT_ID,
    sandboxUrl: process.env.PAYWARE_SANDBOX_URL || 'https://sandbox.payware.eu/api',
    productionUrl: process.env.PAYWARE_PRODUCTION_URL || 'https://api.payware.eu/api'
  };

  // Validate required configuration
  const requiredVars = ['isvPartnerId', 'oauthClientId', 'oauthClientSecret'];
  for (const varName of requiredVars) {
    if (!config[varName]) {
      const envVar = {
        isvPartnerId: 'PAYWARE_PARTNER_ID',
        oauthClientId: 'PAYWARE_OAUTH_CLIENT_ID',
        oauthClientSecret: 'PAYWARE_OAUTH_CLIENT_SECRET'
      }[varName];
      throw new Error(\`\${envVar} environment variable is required for ISV operations\`);
    }
  }

  return config;
}`);

  // OAuth2 functions
  sections.push(`// OAuth2 Authentication for ISV
async function getOAuth2Token(merchantPartnerId, useSandbox = true) {
  const config = loadISVConfig();
  const baseUrl = useSandbox ? config.sandboxUrl : config.productionUrl;

  const tokenData = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.oauthClientId,
    client_secret: config.oauthClientSecret,
    scope: \`merchant:\${merchantPartnerId}\`
  });

  try {
    const response = await axios.post(
      \`\${baseUrl}/oauth2/token\`,
      tokenData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return {
      accessToken: response.data.access_token,
      tokenType: response.data.token_type,
      expiresIn: response.data.expires_in,
      scope: response.data.scope
    };

  } catch (error) {
    throw new Error(\`OAuth2 token request failed: \${error.response?.data?.error || error.message}\`);
  }
}

function createISVJWTToken(merchantPartnerId, oauth2Token, requestBody = null, useSandbox = true) {
  const config = loadISVConfig();

  // Get private key path based on environment
  const privateKeyPath = useSandbox ? config.sandboxKeyPath : config.productionKeyPath;
  if (!privateKeyPath) {
    const envVar = useSandbox ? 'PAYWARE_SANDBOX_PRIVATE_KEY_PATH' : 'PAYWARE_PRODUCTION_PRIVATE_KEY_PATH';
    throw new Error(\`\${envVar} environment variable is required\`);
  }

  // Load ISV private key
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Add content MD5 for requests with body
  let bodyString = null;
  if (requestBody) {
    bodyString = createMinimizedJSON(requestBody);
    const contentMd5 = crypto
      .createHash('md5')
      .update(bodyString, 'utf8')
      .digest('base64');
    header.contentMd5 = contentMd5;
  }

  // Create ISV JWT payload with OAuth2 token
  const payload = {
    iss: config.isvPartnerId,      // ISV Partner ID
    aud: merchantPartnerId,        // Target Merchant ID
    sub: oauth2Token,              // OAuth2 access token
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

  const paramList = ['merchantPartnerId', 'useSandbox = true'];
  if (needsId) {
    paramList.splice(1, 0, 'transactionId');
  }

  // Add custom parameters for specific operations
  if (operation === 'create_transaction') {
    paramList.splice(-1, 0, 'amount = "50.00"', 'currency = "EUR"', 'reasonL1 = "ISV transaction"', 'reasonL2 = null');
  }

  const endpoint = operationConfig.endpoint.replace('{id}', '${transactionId}');

  sections.push(`// Main ISV Operation
async function ${operation}(${paramList.join(', ')}) {
  /**
   * ${operationConfig.description}
   */

  try {
    const config = loadISVConfig();
    const baseUrl = useSandbox ? config.sandboxUrl : config.productionUrl;

    // Step 1: Get OAuth2 token for merchant access
    console.log(\`🔐 Getting OAuth2 token for merchant: \${merchantPartnerId}\`);
    const oauth2Response = await getOAuth2Token(merchantPartnerId, useSandbox);
    const oauth2Token = oauth2Response.accessToken;
    console.log(\`✅ OAuth2 token acquired (expires in: \${oauth2Response.expiresIn || 'unknown'} seconds)\`);

    ${hasBody ? `// Step 2: Prepare request body
    const requestBody = ${JSON.stringify(operationConfig.sampleBody, null, 4)};

    ${operation === 'create_transaction' ? `// Customize with parameters
    if (amount) requestBody.trData.amount = amount;
    if (currency) requestBody.trData.currency = currency;
    if (reasonL1) requestBody.trData.reasonL1 = reasonL1;
    if (reasonL2) requestBody.trData.reasonL2 = reasonL2;` : ''}

    // Step 3: Create ISV JWT token with OAuth2 token
    console.log('🔐 Creating ISV JWT token with OAuth2 authentication');
    const { token, bodyString } = createISVJWTToken(
      merchantPartnerId,
      oauth2Token,
      requestBody,
      useSandbox
    );
    const headers = getAPIHeaders(token);

    // Step 4: Make API request
    const url = \`\${baseUrl}${endpoint}\`;
    console.log(\`📡 Making ${operationConfig.method} request to: \${url}\`);
    const response = await axios.${operationConfig.method.toLowerCase()}(
      url,
      bodyString,
      {
        headers,
        transformRequest: [(data) => data]
      }
    );` : `// Step 2: Create ISV JWT token with OAuth2 token
    console.log('🔐 Creating ISV JWT token with OAuth2 authentication');
    const { token } = createISVJWTToken(
      merchantPartnerId,
      oauth2Token,
      null,
      useSandbox
    );
    const headers = getAPIHeaders(token);

    // Step 3: Make API request
    const url = \`\${baseUrl}${endpoint}\`;
    console.log(\`📡 Making ${operationConfig.method} request to: \${url}\`);
    const response = await axios.${operationConfig.method.toLowerCase()}(
      url,
      { headers }
    );`}

    // Step ${hasBody ? '5' : '4'}: Handle successful response
    return {
      success: true,
      data: response.data,
      merchantPartnerId,
      oauth2Info: {
        tokenType: oauth2Response.tokenType,
        scope: oauth2Response.scope,
        expiresIn: oauth2Response.expiresIn
      },
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
      merchantPartnerId,
      timestamp: new Date().toISOString()
    };
  }
}`);

  // Error handling
  sections.push(`// ISV Error Handling
function handleISVError(errorResponse) {
  const status = errorResponse.status || 0;
  const message = errorResponse.message || 'Unknown error';

  const isvErrorMessages = {
    400: \`Bad Request: \${message}\`,
    401: 'Authentication failed - check ISV credentials and OAuth2 setup',
    403: 'Forbidden - ISV may not have permission for this merchant',
    404: 'Resource not found',
    409: 'Conflict - resource already exists or invalid state',
    429: 'Rate limit exceeded - please retry later',
    500: 'Internal server error - please try again'
  };

  let baseMessage = isvErrorMessages[status] || \`API Error \${status}: \${message}\`;

  // Add ISV-specific guidance
  if (status === 401) {
    baseMessage += '\\n💡 ISV Troubleshooting:';
    baseMessage += '\\n   - Verify PAYWARE_PARTNER_ID is your ISV partner ID';
    baseMessage += '\\n   - Check OAuth2 client credentials';
    baseMessage += '\\n   - Ensure merchant has granted access to your ISV';
  } else if (status === 403) {
    baseMessage += '\\n💡 ISV Authorization:';
    baseMessage += '\\n   - Merchant may need to authorize your ISV application';
    baseMessage += '\\n   - Check OAuth2 scope permissions';
    baseMessage += '\\n   - Verify merchant partner ID is correct';
  }

  return baseMessage;
}`);

  // Example usage
  const exampleParams = needsId ? "'MERCHANT123', 'pw12345678'" : "'MERCHANT123'";
  sections.push(`// Example Usage
async function main() {
  console.log('=== ISV ${operation.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase())} Example ===\\n');

  // Example merchant partner ID (replace with actual merchant ID)
  const merchantId = 'MERCHANT123';

  try {
    // Execute the ISV operation
    const result = await ${operation}(${exampleParams});

    if (result.success) {
      console.log('✅ ISV operation successful!');
      console.log(\`🏢 Merchant: \${result.merchantPartnerId}\`);
      console.log(\`🔐 OAuth2 Scope: \${result.oauth2Info.scope}\`);
      console.log(\`📋 Request ID: \${result.requestId || 'N/A'}\`);
      console.log('\\n📊 Response Data:');
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log('❌ ISV operation failed!');
      console.log(\`🏢 Merchant: \${result.merchantPartnerId}\`);
      const errorMessage = handleISVError(result.error);
      console.log(\`❌ Error: \${errorMessage}\`);

      if (result.error.details) {
        console.log('\\n📋 Error Details:');
        console.log(JSON.stringify(result.error.details, null, 2));
      }
    }

  } catch (error) {
    console.error(\`❌ Unexpected error: \${error.message}\`);
    console.log('\\n💡 Common Issues:');
    console.log('   - Check all ISV environment variables are set');
    console.log('   - Verify merchant has authorized your ISV application');
    console.log('   - Ensure OAuth2 credentials are correct');
  }

  console.log(\`\\nTimestamp: \${new Date().toISOString()}\`);
  console.log('\\n' + '='.repeat(60));
}

// Run the example
main();`);

  return sections.join('\n\n');
}

/**
 * Export all ISV transaction examples
 */
export const ISVTransactionExamples = {
  operations: ISVTransactionOperations,
  generators: {
    python: generateISVTransactionPython,
    nodejs: generateISVTransactionNodeJS,
    javascript: generateISVTransactionNodeJS
  }
};