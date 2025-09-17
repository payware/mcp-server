/**
 * Utility examples and language-specific generators
 */

import { ExampleGenerator, CommonTemplates, CodeUtils } from './helpers.js';

/**
 * Python code generator
 */
export class PythonGenerator extends ExampleGenerator {
  constructor(framework = 'none') {
    super('python', framework);
  }

  getEnvironmentTemplate(partnerType) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `# .env file configuration
${envString}

# Load environment variables
import os
from dotenv import load_dotenv
load_dotenv()`;
  }

  getDependenciesTemplate(operation) {
    const baseDeps = 'requests pyjwt cryptography python-dotenv';

    if (this.framework === 'django') {
      return `# Install dependencies:
# pip install ${baseDeps} django

import requests
import jwt
import json
import hashlib
import base64
import os
from datetime import datetime
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt`;
    }

    if (this.framework === 'fastapi') {
      return `# Install dependencies:
# pip install ${baseDeps} fastapi uvicorn

import requests
import jwt
import json
import hashlib
import base64
import os
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel`;
    }

    return `# Install dependencies:
# pip install ${baseDeps}

import requests
import jwt
import json
import hashlib
import base64
import os
from datetime import datetime`;
  }

  getOperationTemplate(operation, partnerType, params) {
    const endpoint = CommonTemplates.getApiEndpoint(operation, partnerType);
    const method = CommonTemplates.getHttpMethod(operation);
    const sampleBody = CommonTemplates.getSampleRequestBody(operation, partnerType, params);
    const functionName = CodeUtils.formatFunctionName(operation, 'python');

    const hasBody = method !== 'GET' && Object.keys(sampleBody).length > 0;

    if (this.framework === 'django') {
      return this.getDjangoTemplate(operation, endpoint, method, sampleBody, functionName);
    }

    if (this.framework === 'fastapi') {
      return this.getFastAPITemplate(operation, endpoint, method, sampleBody, functionName);
    }

    return `def ${functionName}(${this.getParameterList(operation, params)}):
    """${this.getOperationDescription(operation)}"""

    # Get API configuration
    base_url = get_api_base_url(use_sandbox)

    ${hasBody ? `# Prepare request body
    request_body = ${JSON.stringify(sampleBody, null, 4).replace(/"/g, "'")}

    # Create JWT token with body hash
    token, body_string = create_jwt_token(request_body, use_sandbox)
    headers = get_api_headers(token)

    # Make API request
    response = requests.${method.toLowerCase()}(
        f"{base_url}${endpoint}",
        data=body_string,
        headers=headers
    )` : `# Create JWT token for GET request
    token, _ = create_jwt_token(None, use_sandbox)
    headers = get_api_headers(token)

    # Make API request
    response = requests.${method.toLowerCase()}(
        f"{base_url}${endpoint}",
        headers=headers
    )`}

    # Handle response
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API request failed: {response.status_code} - {response.text}")

# Example usage
if __name__ == "__main__":
    try:
        result = ${functionName}(${this.getExampleParameters(operation, params)})
        print("Success:", json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: {e}")`;
  }

  getDjangoTemplate(operation, endpoint, method, sampleBody, functionName) {
    return `# Django view implementation
@csrf_exempt
def ${functionName}_view(request):
    """Django view for ${operation}"""
    if request.method == '${method}':
        try:
            ${method !== 'GET' ? `# Parse request data
            data = json.loads(request.body)

            # Call payware API
            result = ${functionName}(**data)` : `# Call payware API
            result = ${functionName}()`}

            return JsonResponse({
                'success': True,
                'data': result
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=400)

    return JsonResponse({'error': 'Method not allowed'}, status=405)`;
  }

  getFastAPITemplate(operation, endpoint, method, sampleBody, functionName) {
    const hasBody = method !== 'GET' && Object.keys(sampleBody).length > 0;

    return `# FastAPI implementation
app = FastAPI()

${hasBody ? `class ${operation.charAt(0).toUpperCase() + operation.slice(1)}Request(BaseModel):
    ${Object.keys(sampleBody).map(key => `${key}: str`).join('\n    ')}

@app.${method.toLowerCase()}("/${operation}")
async def ${functionName}(request: ${operation.charAt(0).toUpperCase() + operation.slice(1)}Request):` : `@app.${method.toLowerCase()}("/${operation}")
async def ${functionName}():`}
    """FastAPI endpoint for ${operation}"""
    try:
        ${hasBody ? `# Convert request to dict
        data = request.dict()

        # Call payware API
        result = ${functionName}(**data)` : `# Call payware API
        result = ${functionName}()`}

        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))`;
  }

  getParameterList(operation, params) {
    const baseParams = ['use_sandbox=True'];

    if (operation.includes('_transaction') && !operation.includes('list')) {
      baseParams.unshift('transaction_id');
    }
    if (operation.includes('product') && !operation.includes('create')) {
      baseParams.unshift('product_id');
    }

    return baseParams.join(', ');
  }

  getExampleParameters(operation, params) {
    if (operation.includes('_transaction') && !operation.includes('list')) {
      return '"pw12345678"';
    }
    if (operation.includes('product') && !operation.includes('create')) {
      return '"pr12345678"';
    }
    return '';
  }

  getOperationDescription(operation) {
    const descriptions = {
      create_transaction: 'Create a new payment transaction',
      get_transaction_status: 'Get the status of a transaction',
      cancel_transaction: 'Cancel an active transaction',
      process_transaction: 'Process a transaction',
      create_product: 'Create a new product',
      get_product: 'Get product details',
      update_product: 'Update product information',
      delete_product: 'Delete a product'
    };

    return descriptions[operation] || `Execute ${operation} operation`;
  }

  getErrorHandlingTemplate() {
    return `def handle_payware_error(response):
    """Handle payware API errors consistently"""
    if response.status_code == 401:
        return "Authentication failed - check your credentials"
    elif response.status_code == 400:
        return f"Bad request - {response.json().get('message', 'Invalid data')}"
    elif response.status_code == 404:
        return "Resource not found"
    elif response.status_code == 429:
        return "Rate limit exceeded - please retry later"
    else:
        return f"API error: {response.status_code} - {response.text}"`;
  }

  getTestTemplate(operation, partnerType) {
    return `import unittest
from unittest.mock import patch, Mock

class Test${operation.charAt(0).toUpperCase() + operation.slice(1)}(unittest.TestCase):

    def setUp(self):
        """Set up test environment"""
        os.environ['PAYWARE_PARTNER_ID'] = 'test_partner'
        os.environ['PAYWARE_SANDBOX_PRIVATE_KEY_PATH'] = 'test_key.pem'

    @patch('requests.${CommonTemplates.getHttpMethod(operation).toLowerCase()}')
    def test_${operation}_success(self, mock_request):
        """Test successful ${operation}"""
        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'transactionId': 'pw12345678'}
        mock_request.return_value = mock_response

        # Test the function
        result = ${CodeUtils.formatFunctionName(operation, 'python')}()

        # Assertions
        self.assertEqual(result['transactionId'], 'pw12345678')
        mock_request.assert_called_once()

    @patch('requests.${CommonTemplates.getHttpMethod(operation).toLowerCase()}')
    def test_${operation}_error(self, mock_request):
        """Test error handling for ${operation}"""
        # Mock error response
        mock_response = Mock()
        mock_response.status_code = 400
        mock_response.text = 'Bad Request'
        mock_request.return_value = mock_response

        # Test error handling
        with self.assertRaises(Exception):
            ${CodeUtils.formatFunctionName(operation, 'python')}()

if __name__ == '__main__':
    unittest.main()`;
  }
}

/**
 * Node.js/JavaScript code generator
 */
export class NodeJSGenerator extends ExampleGenerator {
  constructor(framework = 'none') {
    super('nodejs', framework);
  }

  getEnvironmentTemplate(partnerType) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `// .env file configuration
${envString}

// Load environment variables
require('dotenv').config();`;
  }

  getDependenciesTemplate(operation) {
    if (this.framework === 'express') {
      return `// Install dependencies:
// npm install axios jsonwebtoken crypto fs dotenv express

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());`;
    }

    return `// Install dependencies:
// npm install axios jsonwebtoken crypto fs dotenv

const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();`;
  }

  getOperationTemplate(operation, partnerType, params) {
    const endpoint = CommonTemplates.getApiEndpoint(operation, partnerType);
    const method = CommonTemplates.getHttpMethod(operation);
    const sampleBody = CommonTemplates.getSampleRequestBody(operation, partnerType, params);
    const functionName = CodeUtils.formatFunctionName(operation, 'nodejs');

    const hasBody = method !== 'GET' && Object.keys(sampleBody).length > 0;

    if (this.framework === 'express') {
      return this.getExpressTemplate(operation, endpoint, method, sampleBody, functionName);
    }

    return `async function ${functionName}(${this.getParameterList(operation, params)}) {
  /**
   * ${this.getOperationDescription(operation)}
   */

  try {
    // Get API configuration
    const baseURL = getAPIBaseURL(useSandbox);

    ${hasBody ? `// Prepare request body
    const requestBody = ${JSON.stringify(sampleBody, null, 2)};

    // Create JWT token with body hash
    const { token, bodyString } = createJWTToken(requestBody, useSandbox);
    const headers = getAPIHeaders(token);

    // Make API request
    const response = await axios.${method.toLowerCase()}(
      \`\${baseURL}${endpoint}\`,
      bodyString,
      {
        headers,
        transformRequest: [(data) => data]
      }
    );` : `// Create JWT token for GET request
    const { token } = createJWTToken(null, useSandbox);
    const headers = getAPIHeaders(token);

    // Make API request
    const response = await axios.${method.toLowerCase()}(
      \`\${baseURL}${endpoint}\`,
      { headers }
    );`}

    return {
      success: true,
      data: response.data,
      requestId: response.headers['x-request-id']
    };

  } catch (error) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        details: error.response?.data
      }
    };
  }
}

// Example usage
async function main() {
  try {
    const result = await ${functionName}(${this.getExampleParameters(operation, params)});
    if (result.success) {
      console.log('Success:', JSON.stringify(result.data, null, 2));
    } else {
      console.error('Error:', result.error);
    }
  } catch (error) {
    console.error('Unexpected error:', error.message);
  }
}

main();`;
  }

  getExpressTemplate(operation, endpoint, method, sampleBody, functionName) {
    const hasBody = method !== 'GET' && Object.keys(sampleBody).length > 0;

    return `// Express.js route implementation
app.${method.toLowerCase()}('/${operation}', async (req, res) => {
  try {
    ${hasBody ? `// Get data from request body
    const requestData = req.body;

    // Call payware API
    const result = await ${functionName}(requestData);` : `// Call payware API
    const result = await ${functionName}();`}

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        requestId: result.requestId
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: error.message
      }
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`;
  }

  getParameterList(operation, params) {
    const baseParams = ['useSandbox = true'];

    if (operation.includes('_transaction') && !operation.includes('list')) {
      baseParams.unshift('transactionId');
    }
    if (operation.includes('product') && !operation.includes('create')) {
      baseParams.unshift('productId');
    }

    return baseParams.join(', ');
  }

  getExampleParameters(operation, params) {
    if (operation.includes('_transaction') && !operation.includes('list')) {
      return "'pw12345678'";
    }
    if (operation.includes('product') && !operation.includes('create')) {
      return "'pr12345678'";
    }
    return '';
  }

  getOperationDescription(operation) {
    const descriptions = {
      create_transaction: 'Create a new payment transaction',
      get_transaction_status: 'Get the status of a transaction',
      cancel_transaction: 'Cancel an active transaction',
      process_transaction: 'Process a transaction',
      create_product: 'Create a new product',
      get_product: 'Get product details',
      update_product: 'Update product information',
      delete_product: 'Delete a product'
    };

    return descriptions[operation] || `Execute ${operation} operation`;
  }

  getErrorHandlingTemplate() {
    return `function handlePaywareError(error) {
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const data = error.response.data;

    switch (status) {
      case 401:
        return 'Authentication failed - check your credentials';
      case 400:
        return \`Bad request - \${data.message || 'Invalid data'}\`;
      case 404:
        return 'Resource not found';
      case 429:
        return 'Rate limit exceeded - please retry later';
      default:
        return \`API error: \${status} - \${data.message || error.message}\`;
    }
  } else if (error.request) {
    // Network error
    return 'Network error - please check your connection';
  } else {
    // Other error
    return \`Error: \${error.message}\`;
  }
}`;
  }

  getTestTemplate(operation, partnerType) {
    return `// Jest test example
const { ${CodeUtils.formatFunctionName(operation, 'nodejs')} } = require('./payware-client');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('${operation}', () => {
  beforeEach(() => {
    // Set up environment variables
    process.env.PAYWARE_PARTNER_ID = 'test_partner';
    process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH = 'test_key.pem';

    // Clear all mocks
    jest.clearAllMocks();
  });

  test('should handle successful response', async () => {
    // Mock successful response
    const mockResponse = {
      data: { transactionId: 'pw12345678' },
      headers: { 'x-request-id': 'req-123' },
      status: 200
    };

    mockedAxios.${CommonTemplates.getHttpMethod(operation).toLowerCase()}.mockResolvedValue(mockResponse);

    // Test the function
    const result = await ${CodeUtils.formatFunctionName(operation, 'nodejs')}();

    // Assertions
    expect(result.success).toBe(true);
    expect(result.data.transactionId).toBe('pw12345678');
    expect(mockedAxios.${CommonTemplates.getHttpMethod(operation).toLowerCase()}).toHaveBeenCalledTimes(1);
  });

  test('should handle API errors', async () => {
    // Mock error response
    const mockError = {
      response: {
        status: 400,
        data: { message: 'Bad Request' }
      }
    };

    mockedAxios.${CommonTemplates.getHttpMethod(operation).toLowerCase()}.mockRejectedValue(mockError);

    // Test error handling
    const result = await ${CodeUtils.formatFunctionName(operation, 'nodejs')}();

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('Bad Request');
  });
});`;
  }
}

/**
 * Export all utility generators
 */
export const UtilityGenerators = {
  python: PythonGenerator,
  nodejs: NodeJSGenerator,
  javascript: NodeJSGenerator
};