/**
 * Common helper functions for code example generation
 */

/**
 * Base class for all code example generators
 */
export class ExampleGenerator {
  constructor(language, framework = 'none') {
    this.language = language;
    this.framework = framework;
  }

  /**
   * Generate a complete code example
   * @param {string} operation - The operation to generate example for
   * @param {string} partnerType - Partner type (merchant, isv, payment_institution)
   * @param {Object} options - Generation options
   * @returns {string} Generated code example
   */
  generateExample(operation, partnerType, options = {}) {
    const {
      includeComments = true,
      includeErrorHandling = true,
      includeTests = false,
      includeEnvironmentSetup = true,
      ...params
    } = options;

    const sections = [];

    if (includeEnvironmentSetup) {
      sections.push(this.generateEnvironmentSetup(partnerType));
    }

    sections.push(this.generateDependencies(operation));
    sections.push(this.generateAuthSetup(partnerType));
    sections.push(this.generateMainOperation(operation, partnerType, params));

    if (includeErrorHandling) {
      sections.push(this.generateErrorHandling());
    }

    if (includeTests) {
      sections.push(this.generateTests(operation, partnerType));
    }

    return sections.filter(Boolean).join('\n\n');
  }

  /**
   * Generate environment setup section
   */
  generateEnvironmentSetup(partnerType) {
    return this.getEnvironmentTemplate(partnerType);
  }

  /**
   * Generate dependencies section
   */
  generateDependencies(operation) {
    return this.getDependenciesTemplate(operation);
  }

  /**
   * Generate authentication setup
   */
  generateAuthSetup(partnerType) {
    return this.getAuthTemplate(partnerType);
  }

  /**
   * Generate main operation code
   */
  generateMainOperation(operation, partnerType, params) {
    return this.getOperationTemplate(operation, partnerType, params);
  }

  /**
   * Generate error handling code
   */
  generateErrorHandling() {
    return this.getErrorHandlingTemplate();
  }

  /**
   * Generate test code
   */
  generateTests(operation, partnerType) {
    return this.getTestTemplate(operation, partnerType);
  }

  // Abstract methods to be implemented by language-specific generators
  getEnvironmentTemplate(partnerType) { throw new Error('Not implemented'); }
  getDependenciesTemplate(operation) { throw new Error('Not implemented'); }
  getAuthTemplate(partnerType) { throw new Error('Not implemented'); }
  getOperationTemplate(operation, partnerType, params) { throw new Error('Not implemented'); }
  getErrorHandlingTemplate() { throw new Error('Not implemented'); }
  getTestTemplate(operation, partnerType) { throw new Error('Not implemented'); }
}

/**
 * Common templates and utilities
 */
export const CommonTemplates = {
  /**
   * Get environment variables template for partner type
   */
  getEnvironmentVariables(partnerType) {
    const common = {
      PAYWARE_PARTNER_TYPE: partnerType,
      PAYWARE_PARTNER_ID: 'YOUR_PARTNER_ID',
      PAYWARE_SANDBOX_PRIVATE_KEY_PATH: `keys/sandbox-${partnerType}-private-key.pem`,
      PAYWARE_PRODUCTION_PRIVATE_KEY_PATH: `keys/production-${partnerType}-private-key.pem`,
      PAYWARE_SANDBOX_URL: 'https://sandbox.payware.eu/api',
      PAYWARE_PRODUCTION_URL: 'https://api.payware.eu/api'
    };

    if (partnerType === 'isv') {
      return {
        ...common,
        PAYWARE_OAUTH_CLIENT_ID: 'YOUR_OAUTH_CLIENT_ID',
        PAYWARE_OAUTH_CLIENT_SECRET: 'YOUR_OAUTH_CLIENT_SECRET',
        PAYWARE_DEFAULT_MERCHANT_ID: 'TARGET_MERCHANT_ID'
      };
    }

    return common;
  },

  /**
   * Get API endpoints for operations
   */
  getApiEndpoint(operation, partnerType) {
    const endpoints = {
      // Transaction endpoints
      create_transaction: '/transactions',
      get_transaction_status: '/transactions/{id}',
      cancel_transaction: '/transactions/{id}',
      process_transaction: '/transactions/{id}',
      get_transaction_history: '/transactions/{id}/history',
      simulate_callback: '/transactions/{id}/callback',

      // Product endpoints
      create_product: '/products',
      get_product: '/products/{id}',
      update_product: '/products/{id}',
      delete_product: '/products/{id}',
      list_products: '/products',
      get_product_image: '/products/{id}/image',

      // Schedule endpoints
      create_schedule: '/products/{id}/schedules',
      get_schedule: '/products/{id}/schedules/{scheduleId}',
      update_schedule: '/products/{id}/schedules/{scheduleId}',
      delete_schedule: '/products/{id}/schedules/{scheduleId}',
      list_schedules: '/products/{id}/schedules',

      // Audio endpoints
      register_audio: '/products/{id}/audios/upload',
      get_audio: '/products/{id}/audios/{audioId}',
      update_audio: '/products/{id}/audios/{audioId}',
      delete_audio: '/products/{id}/audios/{audioId}',
      list_audios: '/products/{id}/audios',

      // Data endpoints
      generate_report: '/data/reports',
      get_report_status: '/data/reports/{id}',
      export_report: '/data/exports',
      download_export: '/data/exports/{id}',
      cancel_report: '/data/reports/{id}',

      // Deep link endpoints
      get_transaction_link: '/deeplinks/transactions/{id}',
      get_product_link: '/deeplinks/products/{id}',
      delete_transaction_link: '/deeplinks/transactions/{id}',
      delete_product_link: '/deeplinks/products/{id}',

      // OAuth2 endpoints (ISV only)
      obtain_token: '/oauth2/token',
      get_token_info: '/oauth2/token/info',
      create_token_simple: '/oauth2/token/simple',

      // Payment Institution specific
      create_pi_transaction: '/transactions',
      process_pi_transaction: '/transactions/{id}',
      finalize_transaction: '/transactions/{id}/finalize',
      get_pi_transaction_status: '/transactions/{id}',
      get_pi_transaction_history: '/transactions/{id}/history',
      soundbite_transaction: '/transactions',
      simulate_pi_callback: '/transactions/{id}/callback'
    };

    return endpoints[operation] || '/unknown-endpoint';
  },

  /**
   * Get HTTP method for operation
   */
  getHttpMethod(operation) {
    const methods = {
      // GET operations
      get_transaction_status: 'GET',
      get_transaction_history: 'GET',
      get_product: 'GET',
      list_products: 'GET',
      get_product_image: 'GET',
      get_schedule: 'GET',
      list_schedules: 'GET',
      get_audio: 'GET',
      list_audios: 'GET',
      get_report_status: 'GET',
      download_export: 'GET',
      get_transaction_link: 'GET',
      get_product_link: 'GET',
      get_token_info: 'GET',
      get_pi_transaction_status: 'GET',
      get_pi_transaction_history: 'GET',

      // POST operations
      create_transaction: 'POST',
      process_transaction: 'POST',
      simulate_callback: 'POST',
      create_product: 'POST',
      create_schedule: 'POST',
      register_audio: 'POST',
      generate_report: 'POST',
      export_report: 'POST',
      obtain_token: 'POST',
      create_token_simple: 'POST',
      create_pi_transaction: 'POST',
      process_pi_transaction: 'POST',
      finalize_transaction: 'POST',
      soundbite_transaction: 'POST',
      simulate_pi_callback: 'POST',

      // PATCH operations
      cancel_transaction: 'PATCH',
      update_product: 'PATCH',
      update_schedule: 'PATCH',
      update_audio: 'PATCH',

      // DELETE operations
      delete_product: 'DELETE',
      delete_schedule: 'DELETE',
      delete_audio: 'DELETE',
      cancel_report: 'DELETE',
      delete_transaction_link: 'DELETE',
      delete_product_link: 'DELETE'
    };

    return methods[operation] || 'POST';
  },

  /**
   * Get sample request body for operation
   */
  getSampleRequestBody(operation, partnerType, params = {}) {
    const {
      amount = '10.00',
      currency = 'EUR',
      reasonL1 = 'Test transaction',
      reasonL2 = '',
      transactionType = 'PLAIN',
      productName = 'Test Product',
      productPrice = '25.00'
    } = params;

    const bodies = {
      create_transaction: {
        trData: {
          amount,
          currency,
          reasonL1,
          ...(reasonL2 && { reasonL2 })
        },
        trOptions: {
          type: transactionType,
          timeToLive: 120
        }
      },

      cancel_transaction: {
        status: 'CANCELLED',
        statusMessage: 'Cancelled by user request'
      },

      process_transaction: partnerType === 'merchant' ? {
        account: 'MERCHANT_ACCOUNT',
        friendlyName: 'Merchant Name'
      } : {
        account: 'PI_ACCOUNT',
        friendlyName: 'Payment Institution Name',
        trData: {
          amount,
          currency,
          reasonL1
        }
      },

      create_product: {
        name: productName,
        shortDescription: 'Short description of the product',
        prData: {
          type: 'ITEM',
          regularPrice: productPrice,
          currency,
          timeToLive: 86400
        },
        prOptions: {
          imageUrl: 'https://example.com/product-image.jpg'
        }
      },

      create_pi_transaction: {
        trData: {
          amount,
          currency,
          reasonL1,
          ...(reasonL2 && { reasonL2 })
        },
        trOptions: {
          type: transactionType,
          timeToLive: 120
        }
      },

      finalize_transaction: {
        status: 'CONFIRMED',
        amount,
        currency
      },

      obtain_token: {
        grant_type: 'client_credentials',
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET',
        scope: 'transactions:create transactions:read'
      }
    };

    return bodies[operation] || {};
  }
};

/**
 * Utility functions for code generation
 */
export const CodeUtils = {
  /**
   * Format parameter for different languages
   */
  formatParameter(value, language) {
    if (typeof value === 'string') {
      switch (language) {
        case 'python':
          return `'${value}'`;
        case 'javascript':
        case 'nodejs':
          return `'${value}'`;
        case 'php':
          return `'${value}'`;
        case 'java':
          return `"${value}"`;
        case 'csharp':
          return `"${value}"`;
        case 'go':
          return `"${value}"`;
        case 'ruby':
          return `'${value}'`;
        default:
          return `"${value}"`;
      }
    }
    return value;
  },

  /**
   * Generate variable name for different languages
   */
  formatVariableName(name, language) {
    switch (language) {
      case 'python':
        return name.replace(/([A-Z])/g, '_$1').toLowerCase();
      case 'java':
      case 'csharp':
        return name.charAt(0).toLowerCase() + name.slice(1);
      case 'go':
        return name.charAt(0).toUpperCase() + name.slice(1);
      default:
        return name;
    }
  },

  /**
   * Generate function name for different languages
   */
  formatFunctionName(name, language) {
    switch (language) {
      case 'python':
        return name.replace(/([A-Z])/g, '_$1').toLowerCase();
      case 'java':
      case 'javascript':
      case 'nodejs':
        return name.charAt(0).toLowerCase() + name.slice(1);
      case 'csharp':
        return name.charAt(0).toUpperCase() + name.slice(1);
      case 'go':
        return name.charAt(0).toUpperCase() + name.slice(1);
      case 'php':
        return name.charAt(0).toLowerCase() + name.slice(1);
      default:
        return name;
    }
  }
};