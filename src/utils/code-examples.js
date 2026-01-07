/**
 * Generate code examples for different programming languages
 *
 * PAYWARE REQUIREMENT: All examples must demonstrate using the EXACT same
 * compact JSON string for both JWT contentSha256 calculation and HTTP body.
 *
 * Examples use deterministic serialization to guarantee this consistency.
 */

/**
 * Generate Python code example
 */
function generatePythonExample(type, params = {}) {
  const {
    partnerId = 'YOUR_PARTNER_ID',
    amount = '10.00',
    currency = 'EUR',
    transactionType = 'PLAIN',
    reasonL1 = 'Test transaction',
    reasonL2 = ''
  } = params;

  switch (type) {
    case 'complete_flow':
      return `import requests
import jwt
import json
import hashlib
import base64
from datetime import datetime, timedelta
from cryptography.hazmat.primitives import serialization

# Configuration
PARTNER_ID = "${partnerId}"
SANDBOX_URL = "https://sandbox.payware.eu/api"

# Load your private key (generated earlier)
with open('private_key.pem', 'r') as f:
    PRIVATE_KEY = f.read()

def create_deterministic_json(data):
    """Create consistent compact JSON for payware API

    REQUIREMENT: The exact same string must be used for JWT contentSha256 and HTTP body.
    SOLUTION: Sort keys to guarantee consistent output across all platforms.
    """
    # Sort keys recursively to ensure deterministic output
    def sort_dict(obj):
        if isinstance(obj, dict):
            return {k: sort_dict(v) for k, v in sorted(obj.items())}
        elif isinstance(obj, list):
            return [sort_dict(item) for item in obj]
        else:
            return obj

    sorted_data = sort_dict(data)
    return json.dumps(sorted_data, separators=(',', ':'))

def create_jwt_token(request_body=None):
    """Create JWT token for authentication with payware API"""
    now = int(datetime.utcnow().timestamp())

    # JWT header
    header = {
        'alg': 'RS256',
        'typ': 'JWT'
    }

    # Add content SHA-256 for POST requests
    if request_body:
        body_string = create_deterministic_json(request_body)
        content_sha256 = base64.b64encode(hashlib.sha256(body_string.encode('utf-8')).digest()).decode('utf-8')
        header['contentSha256'] = content_sha256

    # JWT payload
    payload = {
        'iss': PARTNER_ID,
        'aud': 'https://payware.eu',
        'iat': now
    }

    token = jwt.encode(payload, PRIVATE_KEY, algorithm='RS256', headers=header)
    return token, body_string if request_body else None

def create_transaction():
    """Create a new transaction"""
    # Build request body according to payware API structure
    data = {
        'trData': {
            'amount': '${amount}',
            'currency': '${currency}',
            'reasonL1': '${reasonL1}'${reasonL2 ? `,
            'reasonL2': '${reasonL2}'` : ''}
        },
        'trOptions': {
            'type': '${transactionType}',
            'timeToLive': 120
        }
    }

    token, deterministic_body = create_jwt_token(data)

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Api-Version': '1'
    }

    # CRITICAL: Send the EXACT same string used for JWT contentSha256 calculation
    # This prevents ERR_INVALID_CONTENT_HASH authentication errors
    response = requests.post(f"{SANDBOX_URL}/transactions", data=deterministic_body, headers=headers)
    return response.json()

def get_transaction_status(transaction_id):
    """Get transaction status"""
    token, _ = create_jwt_token()  # No body for GET request

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Api-Version': '1'
    }

    response = requests.get(f"{SANDBOX_URL}/transactions/{transaction_id}", headers=headers)
    return response.json()

# Example usage
if __name__ == "__main__":
    try:
        # Create transaction
        transaction = create_transaction()
        print("Created transaction:", json.dumps(transaction, indent=2))

        if 'transactionId' in transaction:
            # Check status
            status = get_transaction_status(transaction['transactionId'])
            print("Transaction status:", json.dumps(status, indent=2))
    except Exception as e:
        print(f"Error: {e}")`;

    case 'auth_only':
      return `import jwt
import hashlib
import base64
import json
from datetime import datetime

PARTNER_ID = "${partnerId}"

# Load your private key
with open('private_key.pem', 'r') as f:
    PRIVATE_KEY = f.read()

def create_jwt_token(request_body=None):
    """Create JWT token with proper payware format"""
    now = int(datetime.utcnow().timestamp())

    # JWT header
    header = {
        'alg': 'RS256',
        'typ': 'JWT'
    }

    # Add content SHA-256 for requests with body
    if request_body:
        # PAYWARE REQUIREMENT: Same string for JWT SHA-256 and HTTP body
        # SOLUTION: Use deterministic serialization (sorted keys)
        def sort_dict(obj):
            if isinstance(obj, dict):
                return {k: sort_dict(v) for k, v in sorted(obj.items())}
            elif isinstance(obj, list):
                return [sort_dict(item) for item in obj]
            else:
                return obj

        sorted_data = sort_dict(request_body)
        body_string = json.dumps(sorted_data, separators=(',', ':'))
        content_sha256 = base64.b64encode(hashlib.sha256(body_string.encode('utf-8')).digest()).decode('utf-8')
        header['contentSha256'] = content_sha256

    # JWT payload
    payload = {
        'iss': PARTNER_ID,
        'aud': 'https://payware.eu',
        'iat': now
    }

    return jwt.encode(payload, PRIVATE_KEY, algorithm='RS256', headers=header)

# Usage examples
print("JWT Token for GET request:")
get_token = create_jwt_token()
print(f"Token: {get_token}")

print("\nJWT Token for POST request with body:")
sample_body = {
    'trData': {
        'amount': '10.00',
        'currency': 'EUR',
        'reasonL1': 'Test transaction'
    },
    'trOptions': {
        'type': 'PLAIN',
        'timeToLive': 120
    }
}
post_token = create_jwt_token(sample_body)
print(f"Token: {post_token}")`;

    case 'transaction_only':
      return `import requests
import json

def create_transaction(jwt_token):
    """Create transaction using existing JWT token"""
    headers = {
        'Authorization': f'Bearer {jwt_token}',
        'Content-Type': 'application/json',
        'Api-Version': '1'
    }

    # Build request according to payware API structure
    data = {
        'trData': {
            'amount': '${amount}',
            'currency': '${currency}',
            'reasonL1': '${reasonL1}'${reasonL2 ? `,
            'reasonL2': '${reasonL2}'` : ''}
        },
        'trOptions': {
            'type': '${transactionType}',
            'timeToLive': 120
        }
    }

    # PAYWARE REQUIREMENT: Same string for JWT SHA-256 and HTTP body
    # SOLUTION: Use deterministic serialization (sorted keys)
    def sort_dict(obj):
        if isinstance(obj, dict):
            return {k: sort_dict(v) for k, v in sorted(obj.items())}
        elif isinstance(obj, list):
            return [sort_dict(item) for item in obj]
        else:
            return obj

    sorted_data = sort_dict(data)
    deterministic_body = json.dumps(sorted_data, separators=(',', ':'))

    response = requests.post(
        "https://sandbox.payware.eu/api/transactions",
        data=deterministic_body,
        headers=headers
    )

    return response.json()

# Note: JWT token must include contentSha256 hash for the request body
# Use the auth_only example to create a proper token with body hash`;

    default:
      return 'Unknown example type';
  }
}

/**
 * Generate Node.js code example
 */
function generateNodeJSExample(type, params = {}) {
  const {
    partnerId = 'YOUR_PARTNER_ID',
    amount = '10.00',
    currency = 'EUR',
    transactionType = 'PLAIN',
    reasonL1 = 'Test transaction',
    reasonL2 = ''
  } = params;

  switch (type) {
    case 'complete_flow':
      return `const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');

// Configuration
const PARTNER_ID = '${partnerId}';
const SANDBOX_URL = 'https://sandbox.payware.eu/api';

// Load your private key (generated earlier)
const PRIVATE_KEY = fs.readFileSync('private_key.pem', 'utf8');

function createDeterministicJSON(data) {
  // PAYWARE REQUIREMENT: Same compact JSON for JWT SHA-256 and HTTP body
  // SOLUTION: Sort keys to guarantee consistent output
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

function createJWTToken(requestBody = null) {
  const now = Math.floor(Date.now() / 1000);

  // JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Add content SHA-256 for POST requests
  let deterministicBody = null;
  if (requestBody) {
    deterministicBody = createDeterministicJSON(requestBody);
    const contentSha256 = crypto.createHash('sha256').update(deterministicBody, 'utf8').digest('base64');
    header.contentSha256 = contentSha256;
  }

  // JWT payload
  const payload = {
    iss: PARTNER_ID,
    aud: 'https://payware.eu',
    iat: now
  };

  const token = jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256', header });
  return { token, deterministicBody };
}

async function createTransaction() {
  // Build request body according to payware API structure
  const data = {
    trData: {
      amount: '${amount}',
      currency: '${currency}',
      reasonL1: '${reasonL1}'${reasonL2 ? `,
      reasonL2: '${reasonL2}'` : ''}
    },
    trOptions: {
      type: '${transactionType}',
      timeToLive: 120
    }
  };

  const { token, deterministicBody } = createJWTToken(data);

  const headers = {
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  try {
    // CRITICAL: Send the EXACT same string used for JWT contentSha256 calculation
    // This prevents ERR_INVALID_CONTENT_HASH authentication errors
    const response = await axios.post(\`\${SANDBOX_URL}/transactions\`, deterministicBody, {
      headers,
      // Tell axios to send the string as-is, don't serialize it again
      transformRequest: [(data) => data]
    });
    return response.data;
  } catch (error) {
    console.error('Error creating transaction:', error.response?.data || error.message);
    throw error;
  }
}

async function getTransactionStatus(transactionId) {
  const { token } = createJWTToken(); // No body for GET request

  const headers = {
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json',
    'Api-Version': '1'
  };

  try {
    const response = await axios.get(\`\${SANDBOX_URL}/transactions/\${transactionId}\`, { headers });
    return response.data;
  } catch (error) {
    console.error('Error getting transaction status:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
async function main() {
  try {
    // Create transaction
    const transaction = await createTransaction();
    console.log('Created transaction:', JSON.stringify(transaction, null, 2));

    if (transaction.transactionId) {
      // Check status
      const status = await getTransactionStatus(transaction.transactionId);
      console.log('Transaction status:', JSON.stringify(status, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();`;

    case 'auth_only':
      return `const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');

const PARTNER_ID = '${partnerId}';
const PRIVATE_KEY = fs.readFileSync('private_key.pem', 'utf8');

function createJWTToken(requestBody = null) {
  const now = Math.floor(Date.now() / 1000);

  // JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Add content SHA-256 for requests with body
  if (requestBody) {
    // PAYWARE REQUIREMENT: Same string for JWT SHA-256 and HTTP body
    // SOLUTION: Use deterministic serialization (sorted keys)
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

    const sortedData = sortObject(requestBody);
    const bodyString = JSON.stringify(sortedData);
    const contentSha256 = crypto.createHash('sha256').update(bodyString, 'utf8').digest('base64');
    header.contentSha256 = contentSha256;
  }

  // JWT payload
  const payload = {
    iss: PARTNER_ID,
    aud: 'https://payware.eu',
    iat: now
  };

  return jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256', header });
}

// Usage examples
console.log('JWT Token for GET request:');
const getToken = createJWTToken();
console.log('Token:', getToken);

console.log('\\nJWT Token for POST request with body:');
const sampleBody = {
  trData: {
    amount: '10.00',
    currency: 'EUR',
    reasonL1: 'Test transaction'
  },
  trOptions: {
    type: 'PLAIN',
    timeToLive: 120
  }
};
const postToken = createJWTToken(sampleBody);
console.log('Token:', postToken);`;

    default:
      return 'Unknown example type';
  }
}

/**
 * Generate code examples tool implementation
 */
export const generateCodeExampleTool = {
  name: "payware_utils_generate_code_example",
  description: "Generate code examples for different programming languages and scenarios",
  inputSchema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["python", "nodejs", "javascript"],
        description: "Programming language for the example",
        default: "python"
      },
      type: {
        type: "string",
        enum: ["complete_flow", "auth_only", "transaction_only"],
        description: "Type of code example to generate",
        default: "complete_flow"
      },
      partnerId: {
        type: "string",
        description: "Partner ID to use in example",
        default: "YOUR_PARTNER_ID"
      },
      amount: {
        type: "string",
        description: "Transaction amount as currency value (e.g., '10.00' for €10.00)",
        default: "10.00"
      },
      currency: {
        type: "string",
        enum: ["EUR", "USD", "GBP"],
        description: "Currency for transaction examples",
        default: "EUR"
      },
      transactionType: {
        type: "string",
        enum: ["PLAIN", "QR", "BARCODE"],
        description: "Transaction type for examples",
        default: "PLAIN"
      },
      reasonL1: {
        type: "string",
        description: "Transaction grounds description (required field in payware API)",
        default: "Test transaction"
      },
      reasonL2: {
        type: "string",
        description: "Transaction grounds description continuation (optional field)",
        default: ""
      }
    }
  },
  
  async handler(args) {
    const {
      language = 'python',
      type = 'complete_flow',
      partnerId = 'YOUR_PARTNER_ID',
      amount = '10.00',
      currency = 'EUR',
      transactionType = 'PLAIN',
      reasonL1 = 'Test transaction',
      reasonL2 = ''
    } = args;

    const params = { partnerId, amount, currency, transactionType, reasonL1, reasonL2 };
    
    let code = '';
    let languageName = '';
    let fileExtension = '';
    let dependencies = '';
    
    switch (language.toLowerCase()) {
      case 'python':
        code = generatePythonExample(type, params);
        languageName = 'Python';
        fileExtension = 'py';
        dependencies = `# Install dependencies:
# pip install requests pyjwt cryptography`;
        break;
        
      case 'nodejs':
      case 'javascript':
        code = generateNodeJSExample(type, params);
        languageName = 'Node.js';
        fileExtension = 'js';
        dependencies = `// Install dependencies:
// npm install axios jsonwebtoken`;
        break;
        
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
    
    const typeDescriptions = {
      'complete_flow': 'Complete authentication and transaction flow',
      'auth_only': 'Authentication (JWT token creation) only',
      'transaction_only': 'Transaction creation only (requires existing JWT token)'
    };
    
    return {
      content: [{
        type: "text",
        text: `💻 **${languageName} Code Example Generated**

**Type:** ${typeDescriptions[type] || type}
**Language:** ${languageName}

${dependencies}

**Code Example:**
\`\`\`${language === 'nodejs' ? 'javascript' : language}
${code}
\`\`\`

**Setup Instructions:**
1. Save this code to a file (e.g., \`payware_example.${fileExtension}\`)
2. Install the required dependencies (see above)
3. Replace \`${partnerId}\` with your actual partner ID
4. Ensure you have your \`private_key.pem\` file in the same directory
5. Run the code to test the integration

**⚠️ Important API Changes:**
- Uses correct API endpoint: \`/api/transactions\` (not \`/api/v1/transaction\`)
- Includes required \`Api-Version: 1\` header
- Uses proper request body structure with \`trData\` and \`trOptions\`
- JWT includes \`aud: 'https://payware.eu'\` claim
- POST requests include \`contentSha256\` hash in JWT header
- Amount format uses decimal strings (e.g., '10.00')
- Uses \`reasonL1\`/\`reasonL2\` instead of \`description\`

**Configuration Notes:**
- Amount: ${amount} ${currency}
- Transaction Type: ${transactionType}
- Reason L1: ${reasonL1}
${reasonL2 ? `- Reason L2: ${reasonL2}` : ''}
- Environment: Sandbox only

**Security Reminders:**
- Never hardcode private keys in production code
- Use environment variables for sensitive configuration
- Implement proper error handling and logging
- Validate all inputs and responses

**Next Steps:**
1. Test the code in your development environment
2. Modify parameters as needed for your use case
3. Add proper error handling and logging
4. Implement callback handling if needed
5. Test different transaction scenarios`
      }]
    };
  }
};