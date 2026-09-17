/**
 * Deep links examples (shared across all partner types)
 */

import { ExampleGenerator, CommonTemplates } from '../common/helpers.js';

/**
 * Deep link operations available to all partner types
 */
export const DeepLinkOperations = {
  get_transaction_link: {
    description: 'Get deep link for transaction',
    endpoint: '/deeplinks/transactions/{id}',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      type: 'QR_CODE',
      format: 'PNG',
      size: '256x256',
      theme: 'light'
    }
  },

  get_product_link: {
    description: 'Get deep link for product',
    endpoint: '/deeplinks/products/{id}',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      type: 'URL',
      includeMetadata: true,
      expiry: '24h'
    }
  },

  create_custom_link: {
    description: 'Create custom deep link',
    endpoint: '/deeplinks/custom',
    method: 'POST',
    sampleBody: {
      targetType: 'TRANSACTION',
      targetId: 'tr_example_123',
      linkOptions: {
        type: 'QR_CODE',
        format: 'SVG',
        size: '512x512',
        theme: 'dark',
        logoUrl: 'https://example.com/logo.png'
      },
      metadata: {
        source: 'mobile_app',
        campaign: 'summer_sale_2024',
        customData: {
          userId: 'user_456',
          referralCode: 'REF123'
        }
      },
      expiry: {
        type: 'DURATION',
        value: '7d'
      }
    }
  },

  delete_transaction_link: {
    description: 'Delete transaction deep link',
    endpoint: '/deeplinks/transactions/{id}',
    method: 'DELETE',
    sampleBody: {
      reason: 'Transaction cancelled'
    }
  },

  delete_product_link: {
    description: 'Delete product deep link',
    endpoint: '/deeplinks/products/{id}',
    method: 'DELETE',
    sampleBody: {
      reason: 'Product discontinued'
    }
  },

  list_active_links: {
    description: 'List all active deep links',
    endpoint: '/deeplinks',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      type: 'QR_CODE',
      status: 'ACTIVE',
      limit: 50,
      offset: 0
    }
  },

  get_link_analytics: {
    description: 'Get analytics for deep links',
    endpoint: '/deeplinks/analytics',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      linkId: 'dl_example_123',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      metrics: 'scans,conversions,locations'
    }
  },

  create_batch_links: {
    description: 'Create multiple deep links in batch',
    endpoint: '/deeplinks/batch',
    method: 'POST',
    sampleBody: {
      links: [
        {
          targetType: 'TRANSACTION',
          targetId: 'tr_example_001',
          linkOptions: { type: 'QR_CODE', format: 'PNG' }
        },
        {
          targetType: 'PRODUCT',
          targetId: 'pr_example_001',
          linkOptions: { type: 'URL' }
        }
      ],
      batchOptions: {
        batchId: 'batch_001',
        description: 'Marketing campaign links',
        defaultExpiry: '30d'
      }
    }
  }
};

/**
 * Python Deep Links Generator
 */
export class PythonDeepLinksGenerator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = DeepLinkOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      transactionId = 'tr_example_123',
      productId = 'pr_example_456',
      linkId = 'dl_example_789',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint;
    if (endpoint.includes('{id}')) {
      const id = operation.includes('product') ? productId :
                 operation.includes('transaction') ? transactionId : linkId;
      endpoint = endpoint.replace('{id}', id);
    }

    const functionName = `${operation}_example`;

    return `def ${functionName}(${this.getFunctionParams(operation, transactionId, productId, linkId)}, use_sandbox=True):
    """${opConfig.description}"""

    try:
        # Get API configuration
        base_url = get_api_base_url(use_sandbox)
        endpoint = '${endpoint}'
        url = f"{base_url}{endpoint}"

        ${this.getQueryParamsSection(operation, opConfig)}
        ${this.getRequestBodySection(operation, opConfig)}

        # Create JWT token
        token, body_string = create_jwt_token(request_body, use_sandbox)
        headers = get_api_headers(token)

        ${this.getSpecialHandling(operation, opConfig)}

        ${this.getRequestSection(opConfig.method)}

        ${this.getResponseHandling(operation, opConfig)}

    except requests.exceptions.RequestException as e:
        print(f"Request error: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return None

# Deep link utility functions
def save_qr_code(qr_data, filename='qr_code.png'):
    """Save QR code data to file"""
    import base64

    if isinstance(qr_data, str):
        # Base64 encoded data
        image_data = base64.b64decode(qr_data)
        with open(filename, 'wb') as f:
            f.write(image_data)
        print(f"QR code saved as: {filename}")
        return filename
    else:
        print("Invalid QR code data format")
        return None

def display_link_info(link_result):
    """Display deep link information"""
    if not link_result:
        return

    print("Deep Link Information:")
    print(f"- Link ID: {link_result.get('linkId', 'N/A')}")
    print(f"- Type: {link_result.get('type', 'N/A')}")
    print(f"- URL: {link_result.get('url', 'N/A')}")

    if 'qrCode' in link_result:
        print(f"- QR Code: Available ({link_result.get('format', 'PNG')})")

    if 'expiry' in link_result:
        print(f"- Expires: {link_result.get('expiry', 'N/A')}")

# Example usage
if __name__ == "__main__":
    print("Deep Links Example")

    # ${opConfig.description}
    result = ${functionName}()

    if result:
        print("Deep link operation completed successfully")
        ${this.getUsageExample(operation)}
    else:
        print("Deep link operation failed")`;
  }

  getFunctionParams(operation, transactionId, productId, linkId) {
    const params = [];

    if (operation.includes('transaction')) {
      params.push(`transaction_id='${transactionId}'`);
    } else if (operation.includes('product')) {
      params.push(`product_id='${productId}'`);
    } else if (operation.includes('link') && !operation.includes('batch') && !operation.includes('list')) {
      params.push(`link_id='${linkId}'`);
    }

    return params.join(', ');
  }

  getQueryParamsSection(operation, opConfig) {
    if (!opConfig.queryParams) {
      return '';
    }

    const paramsStr = Object.entries(opConfig.queryParams)
      .map(([key, value]) => `        '${key}': ${typeof value === 'string' ? `'${value}'` : value}`)
      .join(',\n');

    return `# Add query parameters
    params = {
${paramsStr}
    }
    if params:
        url += '?' + '&'.join([f"{k}={v}" for k, v in params.items()])`;
  }

  getRequestBodySection(operation, opConfig) {
    if (!opConfig.sampleBody) {
      return '# No request body needed for this operation\n        request_body = None';
    }

    const bodyStr = JSON.stringify(opConfig.sampleBody, null, 8).replace(/^/gm, '        ');
    return `# Prepare request body
        request_body = ${bodyStr}`;
  }

  getSpecialHandling(operation, opConfig) {
    if (operation.includes('get_') && opConfig.queryParams?.type === 'QR_CODE') {
      return `# Handle QR code response
        if params.get('type') == 'QR_CODE':
            headers['Accept'] = 'application/json'  # QR code will be base64 encoded`;
    }
    return '';
  }

  getRequestSection(method) {
    if (method === 'GET') {
      return 'response = requests.get(url, headers=headers)';
    } else if (method === 'DELETE') {
      return 'response = requests.delete(url, headers=headers, data=body_string if request_body else None)';
    } else {
      return `response = requests.${method.toLowerCase()}(
            url,
            headers=headers,
            data=body_string if request_body else None
        )`;
    }
  }

  getResponseHandling(operation, opConfig) {
    if (operation.includes('get_') && opConfig.queryParams?.type === 'QR_CODE') {
      return `if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} successful:")

            # Handle QR code data
            if 'qrCode' in result:
                qr_filename = f"{operation}_{transaction_id if 'transaction' in operation else product_id}.png"
                saved_file = save_qr_code(result['qrCode'], qr_filename)
                result['qrCodeFile'] = saved_file

            display_link_info(result)
            return result
        else:
            error_msg = f"Request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None`;
    } else {
      return `if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} successful:")
            print(json.dumps(result, indent=2))
            return result
        else:
            error_msg = f"Request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None`;
    }
  }

  getUsageExample(operation) {
    const examples = {
      get_transaction_link: `# Display link information and save QR code
        display_link_info(result)
        if 'qrCodeFile' in result:
            print(f"QR code saved: {result['qrCodeFile']}")`,

      create_custom_link: `# Store custom link details
        if 'linkId' in result:
            link_id = result['linkId']
            print(f"Custom link created: {link_id}")
            print(f"Share URL: {result.get('url', 'N/A')}")`,

      create_batch_links: `# Process batch results
        batch_id = result.get('batchId')
        created_links = result.get('createdLinks', [])
        failed_links = result.get('failedLinks', [])

        print(f"Batch {batch_id}: {len(created_links)} created, {len(failed_links)} failed")
        for link in created_links[:3]:  # Show first 3
            print(f"- {link.get('targetId')}: {link.get('url')}")`,

      get_link_analytics: `# Display analytics data
        analytics = result.get('analytics', {})

        print("Link Analytics:")
        for metric, value in analytics.items():
            if isinstance(value, dict):
                print(f"- {metric}:")
                for sub_metric, sub_value in value.items():
                    print(f"  - {sub_metric}: {sub_value}")
            else:
                print(f"- {metric}: {value}")`
    };

    return examples[operation] || '# Process deep link result as needed';
  }
}

/**
 * Node.js Deep Links Generator
 */
export class NodeJSDeepLinksGenerator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = DeepLinkOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      transactionId = 'tr_example_123',
      productId = 'pr_example_456',
      linkId = 'dl_example_789',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint;
    if (endpoint.includes('{id}')) {
      const id = operation.includes('product') ? productId :
                 operation.includes('transaction') ? transactionId : linkId;
      endpoint = endpoint.replace('{id}', id);
    }

    const functionName = `${operation}Example`;

    return `async function ${functionName}(${this.getFunctionParams(operation, transactionId, productId, linkId)}, useSandbox = true) {
  /**
   * ${opConfig.description}
   */

  try {
    // Get API configuration
    const baseUrl = getAPIBaseURL(useSandbox);
    const endpoint = '${endpoint}';
    let url = \`\${baseUrl}\${endpoint}\`;

    ${this.getQueryParamsSection(operation, opConfig)}
    ${this.getRequestBodySection(operation, opConfig)}

    // Create JWT token
    const { token, bodyString } = createJWTToken(requestBody, useSandbox);
    const headers = getAPIHeaders(token);

    ${this.getSpecialHandling(operation, opConfig)}

    ${this.getRequestSection(opConfig.method)}

    ${this.getResponseHandling(operation, opConfig)}

  } catch (error) {
    if (error.response) {
      console.error(\`API Error: \${error.response.status} - \${error.response.data}\`);
    } else {
      console.error('Request Error:', error.message);
    }
    return null;
  }
}

// Deep link utility functions
function saveQRCode(qrData, filename = 'qr_code.png') {
  /**
   * Save QR code data to file
   */
  const fs = require('fs');

  if (typeof qrData === 'string') {
    // Base64 encoded data
    const imageData = Buffer.from(qrData, 'base64');
    fs.writeFileSync(filename, imageData);
    console.log(\`QR code saved as: \${filename}\`);
    return filename;
  } else {
    console.log('Invalid QR code data format');
    return null;
  }
}

function displayLinkInfo(linkResult) {
  /**
   * Display deep link information
   */
  if (!linkResult) return;

  console.log('Deep Link Information:');
  console.log(\`- Link ID: \${linkResult.linkId || 'N/A'}\`);
  console.log(\`- Type: \${linkResult.type || 'N/A'}\`);
  console.log(\`- URL: \${linkResult.url || 'N/A'}\`);

  if (linkResult.qrCode) {
    console.log(\`- QR Code: Available (\${linkResult.format || 'PNG'})\`);
  }

  if (linkResult.expiry) {
    console.log(\`- Expires: \${linkResult.expiry}\`);
  }
}

// Example usage
async function main() {
  console.log('Deep Links Example');

  try {
    const result = await ${functionName}();

    if (result) {
      console.log('Deep link operation completed successfully');
      ${this.getUsageExample(operation)}
    } else {
      console.log('Deep link operation failed');
    }

  } catch (error) {
    console.error('Deep link operation error:', error.message);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}`;
  }

  getFunctionParams(operation, transactionId, productId, linkId) {
    const params = [];

    if (operation.includes('transaction')) {
      params.push(`transactionId = '${transactionId}'`);
    } else if (operation.includes('product')) {
      params.push(`productId = '${productId}'`);
    } else if (operation.includes('link') && !operation.includes('batch') && !operation.includes('list')) {
      params.push(`linkId = '${linkId}'`);
    }

    return params.join(', ');
  }

  getQueryParamsSection(operation, opConfig) {
    if (!opConfig.queryParams) {
      return '';
    }

    const paramsStr = JSON.stringify(opConfig.queryParams, null, 4).replace(/^/gm, '    ');
    return `// Add query parameters
    const queryParams = ${paramsStr};
    const searchParams = new URLSearchParams(queryParams);
    url += \`?\${searchParams.toString()}\`;`;
  }

  getRequestBodySection(operation, opConfig) {
    if (!opConfig.sampleBody) {
      return '// No request body needed for this operation\n    const requestBody = null;';
    }

    const bodyStr = JSON.stringify(opConfig.sampleBody, null, 4).replace(/^/gm, '    ');
    return `// Prepare request body
    const requestBody = ${bodyStr};`;
  }

  getSpecialHandling(operation, opConfig) {
    if (operation.includes('get_') && opConfig.queryParams?.type === 'QR_CODE') {
      return `// Handle QR code response
    if (queryParams.type === 'QR_CODE') {
      headers['Accept'] = 'application/json';  // QR code will be base64 encoded
    }`;
    }
    return '';
  }

  getRequestSection(method) {
    if (method === 'GET') {
      return 'const response = await axios.get(url, { headers });';
    } else if (method === 'DELETE') {
      return `const response = await axios.delete(url, {
      headers,
      data: bodyString || undefined
    });`;
    } else {
      return `const response = await axios.${method.toLowerCase()}(
      url,
      bodyString || undefined,
      { headers }
    );`;
    }
  }

  getResponseHandling(operation, opConfig) {
    if (operation.includes('get_') && opConfig.queryParams?.type === 'QR_CODE') {
      return `if (response.status === 200) {
      const result = response.data;
      console.log('${opConfig.description} successful:');

      // Handle QR code data
      if (result.qrCode) {
        const qrFilename = \`\${operation}_\${${operation.includes('transaction') ? 'transactionId' : 'productId'}}.png\`;
        const savedFile = saveQRCode(result.qrCode, qrFilename);
        result.qrCodeFile = savedFile;
      }

      displayLinkInfo(result);
      return result;
    } else {
      console.error(\`Request failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }`;
    } else {
      return `if (response.status === 200) {
      const result = response.data;
      console.log('${opConfig.description} successful:');
      console.log(JSON.stringify(result, null, 2));
      return result;
    } else {
      console.error(\`Request failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }`;
    }
  }

  getUsageExample(operation) {
    const examples = {
      get_transaction_link: `// Display link information and save QR code
    displayLinkInfo(result);
    if (result.qrCodeFile) {
      console.log(\`QR code saved: \${result.qrCodeFile}\`);
    }`,

      create_custom_link: `// Store custom link details
    if (result.linkId) {
      const linkId = result.linkId;
      console.log(\`Custom link created: \${linkId}\`);
      console.log(\`Share URL: \${result.url || 'N/A'}\`);
    }`,

      create_batch_links: `// Process batch results
    const batchId = result.batchId;
    const createdLinks = result.createdLinks || [];
    const failedLinks = result.failedLinks || [];

    console.log(\`Batch \${batchId}: \${createdLinks.length} created, \${failedLinks.length} failed\`);
    createdLinks.slice(0, 3).forEach(link => {
      console.log(\`- \${link.targetId}: \${link.url}\`);
    });`,

      get_link_analytics: `// Display analytics data
    const analytics = result.analytics || {};

    console.log('Link Analytics:');
    Object.entries(analytics).forEach(([metric, value]) => {
      if (typeof value === 'object' && value !== null) {
        console.log(\`- \${metric}:\`);
        Object.entries(value).forEach(([subMetric, subValue]) => {
          console.log(\`  - \${subMetric}: \${subValue}\`);
        });
      } else {
        console.log(\`- \${metric}: \${value}\`);
      }
    });`
    };

    return examples[operation] || '// Process deep link result as needed';
  }
}

/**
 * Export all generators
 */
export const DeepLinksGenerators = {
  python: PythonDeepLinksGenerator,
  nodejs: NodeJSDeepLinksGenerator,
  javascript: NodeJSDeepLinksGenerator
};

/**
 * Generate deep links example
 */
export function generateDeepLinksExample(operation, language = 'python', partnerType = 'merchant', options = {}) {
  const GeneratorClass = DeepLinksGenerators[language];
  if (!GeneratorClass) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const generator = new GeneratorClass();
  return generator.generateExample(operation, partnerType, options);
}