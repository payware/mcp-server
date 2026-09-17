/**
 * Payment Institution transaction examples
 */

import { ExampleGenerator, CommonTemplates } from '../common/helpers.js';

/**
 * Payment Institution transaction operations
 */
export const PITransactionOperations = {
  create_pi_transaction: {
    description: 'Create a payment institution transaction',
    endpoint: '/transactions',
    method: 'POST',
    sampleBody: {
      trData: {
        amount: '50.00',
        currency: 'EUR',
        reasonL1: 'Payment processing',
        reasonL2: 'Service fee'
      },
      trOptions: {
        type: 'PLAIN',
        timeToLive: 120
      }
    }
  },

  process_pi_transaction: {
    description: 'Process a payment institution transaction',
    endpoint: '/transactions/{id}',
    method: 'POST',
    sampleBody: {
      account: 'PI_ACCOUNT',
      friendlyName: 'Payment Institution Name',
      paymentMethod: 'A2A',  // Optional: A2A, CARD_FUNDED, BNPL, INSTANT_CREDIT
      trData: {
        amount: '50.00',
        currency: 'EUR',
        reasonL1: 'Payment processing'
      }
    }
  },

  finalize_transaction: {
    description: 'Finalize a payment institution transaction',
    endpoint: '/transactions/{id}/finalize',
    method: 'POST',
    sampleBody: {
      status: 'CONFIRMED',
      amount: '50.00',
      currency: 'EUR',
      finalAmount: '48.50',
      fees: {
        processingFee: '1.50'
      }
    }
  },

  get_pi_transaction_status: {
    description: 'Get payment institution transaction status',
    endpoint: '/transactions/{id}',
    method: 'GET',
    sampleBody: null
  },

  get_pi_transaction_history: {
    description: 'Get payment institution transaction history',
    endpoint: '/transactions/{id}/history',
    method: 'GET',
    sampleBody: null
  },

  soundbite_transaction: {
    description: 'Create a soundbite transaction for payment institution',
    endpoint: '/transactions',
    method: 'POST',
    sampleBody: {
      trData: {
        amount: '25.00',
        currency: 'EUR',
        reasonL1: 'Audio content purchase',
        soundbiteId: 'sb_12345'
      },
      trOptions: {
        type: 'SOUNDBITE',
        timeToLive: 300,
        audioSettings: {
          quality: 'high',
          format: 'mp3'
        }
      }
    }
  },

  simulate_pi_callback: {
    description: 'Simulate payment institution callback for testing',
    endpoint: '/transactions/{id}/callback',
    method: 'POST',
    sampleBody: {
      status: 'COMPLETED',
      statusMessage: 'Transaction processed successfully',
      piReference: 'PI_REF_12345',
      processingTime: '2.5s'
    }
  }
};

/**
 * Python Payment Institution Transaction Generator
 */
export class PythonPITransactionGenerator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = PITransactionOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const { transactionId = 'tr_example_123', ...otherParams } = params;
    const endpoint = opConfig.endpoint.replace('{id}', transactionId);
    const functionName = `${operation}_example`;

    return `def ${functionName}(transaction_id='${transactionId}', use_sandbox=True):
    """${opConfig.description}"""

    # Get API configuration
    base_url = get_api_base_url(use_sandbox)
    endpoint = '${endpoint}'
    url = f"{base_url}{endpoint}"

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
      create_pi_transaction: `# Store transaction ID for later use
        transaction_id = result.get('transactionId')
        print(f"Transaction created with ID: {transaction_id}")`,

      process_pi_transaction: `# Check processing status
        status = result.get('status')
        print(f"Transaction processing status: {status}")`,

      finalize_transaction: `# Verify finalization
        final_amount = result.get('finalAmount')
        fees = result.get('fees', {})
        print(f"Final amount: {final_amount}")
        print(f"Processing fees: {fees}")`,

      get_pi_transaction_status: `# Display transaction details
        status = result.get('status')
        amount = result.get('amount')
        print(f"Transaction status: {status}, Amount: {amount}")`,

      soundbite_transaction: `# Handle soundbite transaction
        soundbite_url = result.get('soundbiteUrl')
        if soundbite_url:
            print(f"Soundbite available at: {soundbite_url}")`,

      simulate_pi_callback: `# Verify callback simulation
        callback_status = result.get('status')
        print(f"Callback simulation status: {callback_status}")`
    };

    return processing[operation] || '# Process result as needed';
  }
}

/**
 * Node.js Payment Institution Transaction Generator
 */
export class NodeJSPITransactionGenerator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = PITransactionOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const { transactionId = 'tr_example_123', ...otherParams } = params;
    const endpoint = opConfig.endpoint.replace('{id}', transactionId);
    const functionName = `${operation}Example`;

    return `async function ${functionName}(transactionId = '${transactionId}', useSandbox = true) {
  /**
   * ${opConfig.description}
   */

  try {
    // Get API configuration
    const baseUrl = getAPIBaseURL(useSandbox);
    const endpoint = '${endpoint}';
    const url = \`\${baseUrl}\${endpoint}\`;

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
  console.log('Payment Institution Transaction Example');

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
      create_pi_transaction: `// Store transaction ID for later use
      const transactionId = result.transactionId;
      console.log(\`Transaction created with ID: \${transactionId}\`);`,

      process_pi_transaction: `// Check processing status
      const status = result.status;
      console.log(\`Transaction processing status: \${status}\`);`,

      finalize_transaction: `// Verify finalization
      const finalAmount = result.finalAmount;
      const fees = result.fees || {};
      console.log(\`Final amount: \${finalAmount}\`);
      console.log(\`Processing fees:\`, fees);`,

      get_pi_transaction_status: `// Display transaction details
      const status = result.status;
      const amount = result.amount;
      console.log(\`Transaction status: \${status}, Amount: \${amount}\`);`,

      soundbite_transaction: `// Handle soundbite transaction
      const soundbiteUrl = result.soundbiteUrl;
      if (soundbiteUrl) {
        console.log(\`Soundbite available at: \${soundbiteUrl}\`);
      }`,

      simulate_pi_callback: `// Verify callback simulation
      const callbackStatus = result.status;
      console.log(\`Callback simulation status: \${callbackStatus}\`);`
    };

    return processing[operation] || '// Process result as needed';
  }
}

/**
 * Export all generators
 */
export const PITransactionGenerators = {
  python: PythonPITransactionGenerator,
  nodejs: NodeJSPITransactionGenerator,
  javascript: NodeJSPITransactionGenerator
};

/**
 * Generate payment institution transaction example
 */
export function generatePITransactionExample(operation, language = 'python', options = {}) {
  const GeneratorClass = PITransactionGenerators[language];
  if (!GeneratorClass) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const generator = new GeneratorClass();
  return generator.generateExample(operation, 'payment_institution', options);
}