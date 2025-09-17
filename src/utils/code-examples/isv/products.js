/**
 * ISV product management examples with OAuth2 authentication
 */

import { ExampleGenerator, CommonTemplates } from '../common/helpers.js';

/**
 * ISV product operations (same endpoints as merchant but with OAuth2 auth)
 */
export const ISVProductOperations = {
  create_product: {
    description: 'Create a product for merchant via ISV',
    endpoint: '/products',
    method: 'POST',
    requiresOAuth: true,
    sampleBody: {
      name: 'ISV Managed Product',
      shortDescription: 'Product created and managed via ISV integration',
      prData: {
        type: 'ITEM',
        regularPrice: '39.99',
        currency: 'EUR',
        timeToLive: 86400
      },
      prOptions: {
        imageUrl: 'https://isv-cdn.example.com/product-image.jpg',
        category: 'digital',
        tags: ['isv-managed', 'digital', 'premium'],
        isvMetadata: {
          sourceSystem: 'ISV_PLATFORM',
          externalId: 'ext_prod_123'
        }
      }
    }
  },

  get_product: {
    description: 'Get merchant product details via ISV',
    endpoint: '/products/{id}',
    method: 'GET',
    requiresOAuth: true,
    sampleBody: null
  },

  update_product: {
    description: 'Update merchant product via ISV',
    endpoint: '/products/{id}',
    method: 'PATCH',
    requiresOAuth: true,
    sampleBody: {
      name: 'ISV Managed Product - Updated',
      prData: {
        regularPrice: '34.99'
      },
      prOptions: {
        isvMetadata: {
          lastUpdated: new Date().toISOString(),
          updateSource: 'ISV_BULK_UPDATE'
        }
      }
    }
  },

  delete_product: {
    description: 'Delete merchant product via ISV',
    endpoint: '/products/{id}',
    method: 'DELETE',
    requiresOAuth: true,
    sampleBody: null
  },

  list_products: {
    description: 'List merchant products via ISV',
    endpoint: '/products',
    method: 'GET',
    requiresOAuth: true,
    sampleBody: null,
    queryParams: {
      limit: 50,
      offset: 0,
      isvManaged: true,
      status: 'active'
    }
  },

  bulk_create_products: {
    description: 'Bulk create products for merchant via ISV',
    endpoint: '/products/bulk',
    method: 'POST',
    requiresOAuth: true,
    sampleBody: {
      products: [
        {
          name: 'Bulk Product 1',
          shortDescription: 'First bulk product',
          prData: { type: 'ITEM', regularPrice: '19.99', currency: 'EUR' },
          prOptions: { category: 'bulk-import' }
        },
        {
          name: 'Bulk Product 2',
          shortDescription: 'Second bulk product',
          prData: { type: 'ITEM', regularPrice: '29.99', currency: 'EUR' },
          prOptions: { category: 'bulk-import' }
        }
      ],
      bulkOptions: {
        batchId: 'batch_001',
        validateOnly: false,
        continueOnError: true
      }
    }
  },

  sync_products: {
    description: 'Synchronize products between ISV and merchant',
    endpoint: '/products/sync',
    method: 'POST',
    requiresOAuth: true,
    sampleBody: {
      syncOptions: {
        direction: 'ISV_TO_MERCHANT',
        conflictResolution: 'ISV_WINS',
        includeDeleted: false
      },
      filters: {
        lastModified: '2024-01-01T00:00:00Z',
        categories: ['digital', 'premium']
      }
    }
  },

  get_product_analytics: {
    description: 'Get product analytics via ISV',
    endpoint: '/products/{id}/analytics',
    method: 'GET',
    requiresOAuth: true,
    sampleBody: null,
    queryParams: {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      metrics: 'sales,views,conversions'
    }
  },

  // Audio/Soundbite Operations
  register_audio: {
    description: 'Register audio file for merchant product via ISV',
    endpoint: '/products/{id}/audios/upload',
    method: 'POST',
    requiresOAuth: true,
    contentType: 'multipart/form-data',
    sampleBody: {
      file: '@/path/to/audio.mp3'
    }
  },

  get_audios: {
    description: 'Get all audio files for merchant product via ISV',
    endpoint: '/products/{id}/audios',
    method: 'GET',
    requiresOAuth: true,
    sampleBody: null
  },

  get_audio: {
    description: 'Get specific audio file details via ISV',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'GET',
    requiresOAuth: true,
    sampleBody: null
  },

  update_audio: {
    description: 'Update audio file information via ISV',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'PATCH',
    requiresOAuth: true,
    sampleBody: {
      title: 'Updated Audio Title',
      productId: 'pr_new_product_789'
    }
  },

  delete_audio: {
    description: 'Delete audio file via ISV',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'DELETE',
    requiresOAuth: true,
    sampleBody: null
  }
};

/**
 * Python ISV Product Generator
 */
export class PythonISVProductGenerator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = ISVProductOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      productId = 'pr_example_123',
      merchantPartnerId = 'merchant_456',
      audioId = 'aud_example_789',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint.replace('{id}', productId);
    if (endpoint.includes('{audioId}')) {
      endpoint = endpoint.replace('{audioId}', audioId);
    }
    const functionName = `${operation}_example`;

    return `def ${functionName}(product_id='${productId}', merchant_partner_id='${merchantPartnerId}'${audioId && operation.includes('audio') && !operation.includes('get_audios') && !operation.includes('register') ? `, audio_id='${audioId}'` : ''}, use_sandbox=True):
    """${opConfig.description}"""

    try:
        # Step 1: Get OAuth2 token for merchant access
        oauth2_token = get_oauth2_token(merchant_partner_id)
        if not oauth2_token:
            print("Failed to obtain OAuth2 token")
            return None

        # Step 2: Get API configuration
        base_url = get_api_base_url(use_sandbox)
        endpoint = '${endpoint}'
        url = f"{base_url}{endpoint}"

        ${this.getQueryParamsSection(operation, opConfig)}
        ${this.getRequestBodySection(operation, opConfig)}

        # Step 3: Create ISV JWT token with OAuth2 token
        token, body_string = create_isv_jwt_token(merchant_partner_id, oauth2_token, request_body, use_sandbox)
        headers = get_api_headers(token)

        # Step 4: Make API request
        ${this.getRequestSection(opConfig.method)}

        if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} successful:")
            print(json.dumps(result, indent=2))

            ${this.getResultProcessingSection(operation)}
            return result
        else:
            error_msg = f"Request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None

    except Exception as e:
        print(f"Error in ${operation}: {str(e)}")
        return None

def create_isv_jwt_token(merchant_partner_id, oauth2_token, request_body=None, use_sandbox=True):
    """Create ISV JWT token with OAuth2 authentication"""

    # Get ISV configuration
    isv_partner_id = os.getenv('PAYWARE_ISV_PARTNER_ID')
    if use_sandbox:
        private_key_path = os.getenv('PAYWARE_SANDBOX_ISV_PRIVATE_KEY_PATH')
    else:
        private_key_path = os.getenv('PAYWARE_PRODUCTION_ISV_PRIVATE_KEY_PATH')

    if not isv_partner_id or not private_key_path:
        raise ValueError("Missing ISV configuration")

    # Load private key
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

    # Create JWT payload for ISV
    payload = {
        'iss': isv_partner_id,           # ISV Partner ID
        'aud': merchant_partner_id,      # Target Merchant ID
        'sub': oauth2_token,             # OAuth2 access token
        'iat': int(datetime.utcnow().timestamp())
    }

    # Create and return token
    token = jwt.encode(payload, private_key, algorithm='RS256', headers=header)
    return token, body_string

# Example usage
if __name__ == "__main__":
    # Set target merchant
    target_merchant = os.getenv('PAYWARE_TARGET_MERCHANT_ID', 'merchant_example')

    # ${opConfig.description}
    result = ${functionName}(merchant_partner_id=target_merchant)

    if result:
        print("ISV operation completed successfully")
        ${this.getISVResultProcessingSection(operation)}
    else:
        print("ISV operation failed")`;
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

  getRequestSection(method) {
    if (method === 'GET') {
      return 'response = requests.get(url, headers=headers)';
    } else if (method === 'DELETE') {
      return 'response = requests.delete(url, headers=headers)';
    } else {
      return `response = requests.${method.toLowerCase()}(
            url,
            headers=headers,
            data=body_string if request_body else None
        )`;
    }
  }

  getResultProcessingSection(operation) {
    const processing = {
      create_product: `# Store product ID and ISV metadata
            product_id = result.get('productId')
            isv_metadata = result.get('prOptions', {}).get('isvMetadata', {})
            print(f"Product created with ID: {product_id}")
            print(f"ISV metadata: {isv_metadata}")`,

      bulk_create_products: `# Process bulk creation results
            created_products = result.get('createdProducts', [])
            failed_products = result.get('failedProducts', [])
            print(f"Successfully created: {len(created_products)} products")
            print(f"Failed to create: {len(failed_products)} products")`,

      sync_products: `# Display sync results
            sync_stats = result.get('syncStats', {})
            print(f"Sync completed:")
            print(f"- Created: {sync_stats.get('created', 0)}")
            print(f"- Updated: {sync_stats.get('updated', 0)}")
            print(f"- Deleted: {sync_stats.get('deleted', 0)}")`,

      get_product_analytics: `# Display analytics data
            analytics = result.get('analytics', {})
            metrics = analytics.get('metrics', {})
            print("Product Analytics:")
            for metric, value in metrics.items():
                print(f"- {metric}: {value}")`
    };

    return processing[operation] || '# Process ISV result as needed';
  }

  getISVResultProcessingSection(operation) {
    const processing = {
      create_product: `# Log ISV operation for audit
        print("ISV Product Creation completed - check merchant dashboard")`,

      bulk_create_products: `# Generate ISV report
        print("Bulk creation completed - generating ISV summary report")`,

      sync_products: `# Update ISV sync status
        print("Product synchronization completed - updating ISV tracking")`
    };

    return processing[operation] || '# Log ISV operation completion';
  }
}

/**
 * Node.js ISV Product Generator
 */
export class NodeJSISVProductGenerator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = ISVProductOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      productId = 'pr_example_123',
      merchantPartnerId = 'merchant_456',
      audioId = 'aud_example_789',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint.replace('{id}', productId);
    if (endpoint.includes('{audioId}')) {
      endpoint = endpoint.replace('{audioId}', audioId);
    }
    const functionName = `${operation}Example`;

    return `async function ${functionName}(productId = '${productId}', merchantPartnerId = '${merchantPartnerId}'${audioId && operation.includes('audio') && !operation.includes('get_audios') && !operation.includes('register') ? `, audioId = '${audioId}'` : ''}, useSandbox = true) {
  /**
   * ${opConfig.description}
   */

  try {
    // Step 1: Get OAuth2 token for merchant access
    const oauth2Token = await getOAuth2Token(merchantPartnerId);
    if (!oauth2Token) {
      console.error('Failed to obtain OAuth2 token');
      return null;
    }

    // Step 2: Get API configuration
    const baseUrl = getAPIBaseURL(useSandbox);
    const endpoint = '${endpoint}';
    let url = \`\${baseUrl}\${endpoint}\`;

    ${this.getQueryParamsSection(operation, opConfig)}
    ${this.getRequestBodySection(operation, opConfig)}

    // Step 3: Create ISV JWT token with OAuth2 token
    const { token, bodyString } = createISVJWTToken(merchantPartnerId, oauth2Token, requestBody, useSandbox);
    const headers = getAPIHeaders(token);

    // Step 4: Make API request
    ${this.getRequestSection(opConfig.method)}

    if (response.status === 200) {
      const result = response.data;
      console.log('${opConfig.description} successful:');
      console.log(JSON.stringify(result, null, 2));

      ${this.getResultProcessingSection(operation)}

      return result;
    } else {
      console.error(\`Request failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }

  } catch (error) {
    console.error(\`Error in ${operation}:\`, error.message);
    if (error.response) {
      console.error('API Error:', error.response.data);
    }
    return null;
  }
}

function createISVJWTToken(merchantPartnerId, oauth2Token, requestBody = null, useSandbox = true) {
  /**
   * Create ISV JWT token with OAuth2 authentication
   */

  // Get ISV configuration
  const isvPartnerId = process.env.PAYWARE_ISV_PARTNER_ID;
  const privateKeyPath = useSandbox ?
    process.env.PAYWARE_SANDBOX_ISV_PRIVATE_KEY_PATH :
    process.env.PAYWARE_PRODUCTION_ISV_PRIVATE_KEY_PATH;

  if (!isvPartnerId || !privateKeyPath) {
    throw new Error('Missing ISV configuration');
  }

  // Load private key
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

  // Create JWT payload for ISV
  const payload = {
    iss: isvPartnerId,        // ISV Partner ID
    aud: merchantPartnerId,   // Target Merchant ID
    sub: oauth2Token,         // OAuth2 access token
    iat: Math.floor(Date.now() / 1000)
  };

  // Create and return token
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header
  });

  return { token, bodyString };
}

// Example usage
async function main() {
  console.log('ISV Product Management Example');

  // Set target merchant
  const targetMerchant = process.env.PAYWARE_TARGET_MERCHANT_ID || 'merchant_example';

  const result = await ${functionName}(undefined, targetMerchant);

  if (result) {
    console.log('ISV operation completed successfully');
    ${this.getISVResultProcessingSection(operation)}
  } else {
    console.log('ISV operation failed');
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}`;
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

  getRequestSection(method) {
    if (method === 'GET') {
      return 'const response = await axios.get(url, { headers });';
    } else if (method === 'DELETE') {
      return 'const response = await axios.delete(url, { headers });';
    } else {
      return `const response = await axios.${method.toLowerCase()}(
      url,
      bodyString || undefined,
      { headers }
    );`;
    }
  }

  getResultProcessingSection(operation) {
    const processing = {
      create_product: `// Store product ID and ISV metadata
      const productId = result.productId;
      const isvMetadata = result.prOptions?.isvMetadata || {};
      console.log(\`Product created with ID: \${productId}\`);
      console.log('ISV metadata:', isvMetadata);`,

      bulk_create_products: `// Process bulk creation results
      const createdProducts = result.createdProducts || [];
      const failedProducts = result.failedProducts || [];
      console.log(\`Successfully created: \${createdProducts.length} products\`);
      console.log(\`Failed to create: \${failedProducts.length} products\`);`,

      sync_products: `// Display sync results
      const syncStats = result.syncStats || {};
      console.log('Sync completed:');
      console.log(\`- Created: \${syncStats.created || 0}\`);
      console.log(\`- Updated: \${syncStats.updated || 0}\`);
      console.log(\`- Deleted: \${syncStats.deleted || 0}\`);`,

      get_product_analytics: `// Display analytics data
      const analytics = result.analytics || {};
      const metrics = analytics.metrics || {};
      console.log('Product Analytics:');
      Object.entries(metrics).forEach(([metric, value]) => {
        console.log(\`- \${metric}: \${value}\`);
      });`
    };

    return processing[operation] || '// Process ISV result as needed';
  }

  getISVResultProcessingSection(operation) {
    const processing = {
      create_product: `// Log ISV operation for audit
    console.log('ISV Product Creation completed - check merchant dashboard');`,

      bulk_create_products: `// Generate ISV report
    console.log('Bulk creation completed - generating ISV summary report');`,

      sync_products: `// Update ISV sync status
    console.log('Product synchronization completed - updating ISV tracking');`
    };

    return processing[operation] || '// Log ISV operation completion';
  }
}

/**
 * Export all generators
 */
export const ISVProductGenerators = {
  python: PythonISVProductGenerator,
  nodejs: NodeJSISVProductGenerator,
  javascript: NodeJSISVProductGenerator
};

/**
 * Generate ISV product example
 */
export function generateISVProductExample(operation, language = 'python', options = {}) {
  const GeneratorClass = ISVProductGenerators[language];
  if (!GeneratorClass) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const generator = new GeneratorClass();
  return generator.generateExample(operation, 'isv', options);
}