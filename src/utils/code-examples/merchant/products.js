/**
 * Merchant product management examples
 */

import { ExampleGenerator, CommonTemplates } from '../common/helpers.js';

/**
 * Merchant product operations
 */
export const MerchantProductOperations = {
  create_product: {
    description: 'Create a new product for merchant',
    endpoint: '/products',
    method: 'POST',
    sampleBody: {
      name: 'Premium Coffee Blend',
      shortDescription: 'Our signature premium coffee blend with rich flavor',
      prData: {
        type: 'ITEM',
        regularPrice: '25.99',
        currency: 'EUR',
        timeToLive: 86400
      },
      prOptions: {
        imageUrl: 'https://example.com/coffee-image.jpg',
        category: 'beverages',
        tags: ['coffee', 'premium', 'organic']
      }
    }
  },

  get_product: {
    description: 'Get product details',
    endpoint: '/products/{id}',
    method: 'GET',
    sampleBody: null
  },

  update_product: {
    description: 'Update existing product',
    endpoint: '/products/{id}',
    method: 'PATCH',
    sampleBody: {
      name: 'Premium Coffee Blend - Updated',
      prData: {
        regularPrice: '24.99',
        currency: 'EUR'
      },
      prOptions: {
        imageUrl: 'https://example.com/coffee-new-image.jpg'
      }
    }
  },

  delete_product: {
    description: 'Delete a product',
    endpoint: '/products/{id}',
    method: 'DELETE',
    sampleBody: null
  },

  list_products: {
    description: 'List all merchant products',
    endpoint: '/products',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      limit: 20,
      offset: 0,
      category: 'beverages',
      status: 'active'
    }
  },

  get_product_image: {
    description: 'Get product image',
    endpoint: '/products/{id}/image',
    method: 'GET',
    sampleBody: null
  },

  create_schedule: {
    description: 'Create product schedule',
    endpoint: '/products/{id}/schedules',
    method: 'POST',
    sampleBody: {
      name: 'Weekend Special',
      scheduleType: 'DISCOUNT',
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
      conditions: {
        dayOfWeek: ['SATURDAY', 'SUNDAY'],
        timeRange: {
          start: '10:00',
          end: '18:00'
        }
      },
      action: {
        discountPercent: 15
      }
    }
  },

  update_schedule: {
    description: 'Update product schedule',
    endpoint: '/products/{id}/schedules/{scheduleId}',
    method: 'PATCH',
    sampleBody: {
      action: {
        discountPercent: 20
      },
      conditions: {
        dayOfWeek: ['FRIDAY', 'SATURDAY', 'SUNDAY']
      }
    }
  },

  delete_schedule: {
    description: 'Delete product schedule',
    endpoint: '/products/{id}/schedules/{scheduleId}',
    method: 'DELETE',
    sampleBody: null
  },

  list_schedules: {
    description: 'List product schedules',
    endpoint: '/products/{id}/schedules',
    method: 'GET',
    sampleBody: null
  },

  // Audio/Soundbite Operations
  register_audio: {
    description: 'Register audio file for a product',
    endpoint: '/products/{id}/audios/upload',
    method: 'POST',
    contentType: 'multipart/form-data',
    sampleBody: {
      file: '@/path/to/audio.mp3'
    }
  },

  get_audios: {
    description: 'Get all audio files for a product',
    endpoint: '/products/{id}/audios',
    method: 'GET',
    sampleBody: null
  },

  get_audio: {
    description: 'Get specific audio file details',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'GET',
    sampleBody: null
  },

  update_audio: {
    description: 'Update audio file information',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'PATCH',
    sampleBody: {
      title: 'Updated Audio Title',
      productId: 'pr_new_product_789'
    }
  },

  delete_audio: {
    description: 'Delete audio file',
    endpoint: '/products/{id}/audios/{audioId}',
    method: 'DELETE',
    sampleBody: null
  }
};

/**
 * Python Merchant Product Generator
 */
export class PythonMerchantProductGenerator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = MerchantProductOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const { productId = 'pr_example_123', scheduleId = 'sch_example_456', audioId = 'aud_example_789', ...otherParams } = params;
    let endpoint = opConfig.endpoint.replace('{id}', productId);
    if (endpoint.includes('{scheduleId}')) {
      endpoint = endpoint.replace('{scheduleId}', scheduleId);
    }
    if (endpoint.includes('{audioId}')) {
      endpoint = endpoint.replace('{audioId}', audioId);
    }
    const functionName = `${operation}_example`;

    return `def ${functionName}(product_id='${productId}'${scheduleId && operation.includes('schedule') ? `, schedule_id='${scheduleId}'` : ''}${audioId && operation.includes('audio') && !operation.includes('get_audios') && !operation.includes('register') ? `, audio_id='${audioId}'` : ''}, use_sandbox=True):
    """${opConfig.description}"""

    # Get API configuration
    base_url = get_api_base_url(use_sandbox)
    endpoint = '${endpoint}'
    url = f"{base_url}{endpoint}"

    ${this.getQueryParamsSection(operation, opConfig)}
    ${this.getRequestBodySection(operation, opConfig)}

    # Create JWT token
    token, body_string = create_jwt_token(request_body, use_sandbox)
    headers = get_api_headers(token)

    try:
        ${this.getRequestSection(opConfig.method)}

        if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} successful:")
            print(json.dumps(result, indent=2))
            return result
        else:
            error_msg = f"Request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None

    except requests.exceptions.RequestException as e:
        print(f"Request error: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return None

# Example usage
if __name__ == "__main__":
    # ${opConfig.description}
    result = ${functionName}()

    if result:
        print("Operation completed successfully")
        ${this.getResultProcessingSection(operation)}
    else:
        print("Operation failed")`;
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
      return '# No request body needed for this operation\n    request_body = None';
    }

    const bodyStr = JSON.stringify(opConfig.sampleBody, null, 8).replace(/^/gm, '    ');
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
      create_product: `# Store product ID for later use
        product_id = result.get('productId')
        print(f"Product created with ID: {product_id}")`,

      get_product: `# Display product details
        name = result.get('name')
        price = result.get('prData', {}).get('regularPrice')
        print(f"Product: {name}, Price: {price}")`,

      list_products: `# Display products list
        products = result.get('products', [])
        print(f"Found {len(products)} products:")
        for product in products[:5]:  # Show first 5
            print(f"- {product.get('name')}: {product.get('prData', {}).get('regularPrice')}")`,

      create_schedule: `# Store schedule ID
        schedule_id = result.get('scheduleId')
        print(f"Schedule created with ID: {schedule_id}")`,

      list_schedules: `# Display schedules
        schedules = result.get('schedules', [])
        print(f"Found {len(schedules)} schedules:")
        for schedule in schedules:
            print(f"- {schedule.get('name')}: {schedule.get('scheduleType')}")`
    };

    return processing[operation] || '# Process result as needed';
  }
}

/**
 * Node.js Merchant Product Generator
 */
export class NodeJSMerchantProductGenerator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = MerchantProductOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const { productId = 'pr_example_123', scheduleId = 'sch_example_456', audioId = 'aud_example_789', ...otherParams } = params;
    let endpoint = opConfig.endpoint.replace('{id}', productId);
    if (endpoint.includes('{scheduleId}')) {
      endpoint = endpoint.replace('{scheduleId}', scheduleId);
    }
    if (endpoint.includes('{audioId}')) {
      endpoint = endpoint.replace('{audioId}', audioId);
    }
    const functionName = `${operation}Example`;

    return `async function ${functionName}(productId = '${productId}'${scheduleId && operation.includes('schedule') ? `, scheduleId = '${scheduleId}'` : ''}${audioId && operation.includes('audio') && !operation.includes('get_audios') && !operation.includes('register') ? `, audioId = '${audioId}'` : ''}, useSandbox = true) {
  /**
   * ${opConfig.description}
   */

  try {
    // Get API configuration
    const baseUrl = getAPIBaseURL(useSandbox);
    let endpoint = '${endpoint}';
    let url = \`\${baseUrl}\${endpoint}\`;

    ${this.getQueryParamsSection(operation, opConfig)}
    ${this.getRequestBodySection(operation, opConfig)}

    // Create JWT token
    const { token, bodyString } = createJWTToken(requestBody, useSandbox);
    const headers = getAPIHeaders(token);

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
    if (error.response) {
      console.error(\`API Error: \${error.response.status} - \${error.response.data}\`);
    } else if (error.request) {
      console.error('Network Error:', error.message);
    } else {
      console.error('Request Error:', error.message);
    }
    return null;
  }
}

// Example usage
async function main() {
  console.log('Merchant Product Management Example');

  const result = await ${functionName}();

  if (result) {
    console.log('Operation completed successfully');
  } else {
    console.log('Operation failed');
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
      create_product: `// Store product ID for later use
      const productId = result.productId;
      console.log(\`Product created with ID: \${productId}\`);`,

      get_product: `// Display product details
      const name = result.name;
      const price = result.prData?.regularPrice;
      console.log(\`Product: \${name}, Price: \${price}\`);`,

      list_products: `// Display products list
      const products = result.products || [];
      console.log(\`Found \${products.length} products:\`);
      products.slice(0, 5).forEach(product => {
        console.log(\`- \${product.name}: \${product.prData?.regularPrice}\`);
      });`,

      create_schedule: `// Store schedule ID
      const scheduleId = result.scheduleId;
      console.log(\`Schedule created with ID: \${scheduleId}\`);`,

      list_schedules: `// Display schedules
      const schedules = result.schedules || [];
      console.log(\`Found \${schedules.length} schedules:\`);
      schedules.forEach(schedule => {
        console.log(\`- \${schedule.name}: \${schedule.scheduleType}\`);
      });`
    };

    return processing[operation] || '// Process result as needed';
  }
}

/**
 * Export all generators
 */
export const MerchantProductGenerators = {
  python: PythonMerchantProductGenerator,
  nodejs: NodeJSMerchantProductGenerator,
  javascript: NodeJSMerchantProductGenerator
};

/**
 * Generate merchant product example
 */
export function generateMerchantProductExample(operation, language = 'python', options = {}) {
  const GeneratorClass = MerchantProductGenerators[language];
  if (!GeneratorClass) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const generator = new GeneratorClass();
  return generator.generateExample(operation, 'merchant', options);
}