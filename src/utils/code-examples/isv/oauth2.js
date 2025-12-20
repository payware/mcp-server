/**
 * ISV OAuth2 authentication flow examples
 */

import { ExampleGenerator, CommonTemplates } from '../common/helpers.js';

/**
 * OAuth2 operations for ISV
 */
export const OAuth2Operations = {
  obtain_token: {
    description: 'Obtain OAuth2 access token for merchant access',
    endpoint: '/oauth2/token',
    method: 'POST',
    sampleBody: {
      grant_type: 'client_credentials',
      client_id: 'YOUR_CLIENT_ID',
      client_secret: 'YOUR_CLIENT_SECRET',
      scope: 'merchant:transactions merchant:products merchant:data'
    }
  },

  get_token_info: {
    description: 'Get information about current OAuth2 token',
    endpoint: '/oauth2/token/info',
    method: 'GET',
    sampleBody: null
  },

  create_token_simple: {
    description: 'Create simple OAuth2 token with basic scope',
    endpoint: '/oauth2/token/simple',
    method: 'POST',
    sampleBody: {
      grant_type: 'client_credentials',
      scope: 'merchant:read'
    }
  },

  refresh_token: {
    description: 'Refresh an existing OAuth2 token',
    endpoint: '/oauth2/token/refresh',
    method: 'POST',
    sampleBody: {
      grant_type: 'refresh_token',
      refresh_token: 'REFRESH_TOKEN_HERE'
    }
  },

  revoke_token: {
    description: 'Revoke OAuth2 access token',
    endpoint: '/oauth2/token/revoke',
    method: 'POST',
    sampleBody: {
      token: 'TOKEN_TO_REVOKE',
      token_type_hint: 'access_token'
    }
  },

  list_active_tokens: {
    description: 'List all active OAuth2 tokens for ISV',
    endpoint: '/oauth2/tokens',
    method: 'GET',
    sampleBody: null
  }
};

/**
 * Python OAuth2 Generator
 */
export class PythonOAuth2Generator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = OAuth2Operations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const { merchantPartnerId = 'merchant_456', scope = 'merchant:full', ...otherParams } = params;
    const functionName = `${operation}_example`;

    return `def ${functionName}(merchant_partner_id='${merchantPartnerId}', scope='${scope}', use_sandbox=True):
    """${opConfig.description}"""

    try:
        # Get OAuth2 configuration
        client_id = os.getenv('PAYWARE_OAUTH_CLIENT_ID')
        client_secret = os.getenv('PAYWARE_OAUTH_CLIENT_SECRET')

        if not client_id or not client_secret:
            print("Missing OAuth2 credentials in environment")
            return None

        # Get API configuration
        base_url = get_api_base_url(use_sandbox)
        endpoint = '${opConfig.endpoint}'
        url = f"{base_url}{endpoint}"

        ${this.getRequestBodySection(operation, opConfig, merchantPartnerId)}

        # OAuth2 requests use application/x-www-form-urlencoded
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Api-Version': '1'
        }

        ${this.getRequestSection(opConfig.method)}

        if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} successful:")
            print(json.dumps(result, indent=2))

            ${this.getResultProcessingSection(operation)}
            return result
        else:
            error_msg = f"OAuth2 request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None

    except requests.exceptions.RequestException as e:
        print(f"OAuth2 request error: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return None

def get_oauth2_token_for_merchant(merchant_partner_id, scope='merchant:full', use_sandbox=True):
    """Convenience function to get OAuth2 token for specific merchant"""

    client_id = os.getenv('PAYWARE_OAUTH_CLIENT_ID')
    client_secret = os.getenv('PAYWARE_OAUTH_CLIENT_SECRET')

    if not client_id or not client_secret:
        raise ValueError("Missing OAuth2 credentials")

    base_url = get_api_base_url(use_sandbox)
    url = f"{base_url}/oauth2/token"

    data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': f"merchant:{merchant_partner_id} {scope}"
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Api-Version': '1'
    }

    try:
        response = requests.post(url, data=data, headers=headers)

        if response.status_code == 200:
            token_data = response.json()
            return token_data['access_token']
        else:
            print(f"OAuth2 token request failed: {response.status_code} - {response.text}")
            return None

    except Exception as e:
        print(f"OAuth2 token error: {str(e)}")
        return None

def validate_oauth2_token(access_token, use_sandbox=True):
    """Validate OAuth2 token and get token information"""

    base_url = get_api_base_url(use_sandbox)
    url = f"{base_url}/oauth2/token/info"

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Api-Version': '1'
    }

    try:
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            token_info = response.json()
            print("Token validation successful:")
            print(f"- Valid: {token_info.get('active', False)}")
            print(f"- Scope: {token_info.get('scope', 'N/A')}")
            print(f"- Expires in: {token_info.get('expires_in', 'N/A')} seconds")
            return token_info
        else:
            print(f"Token validation failed: {response.status_code}")
            return None

    except Exception as e:
        print(f"Token validation error: {str(e)}")
        return None

# Example usage
if __name__ == "__main__":
    # Get target merchant from environment or use default
    target_merchant = os.getenv('PAYWARE_TARGET_MERCHANT_ID', 'merchant_example')

    print("=== OAuth2 Flow Example ===")

    # Step 1: Obtain OAuth2 token
    print("\\n1. Obtaining OAuth2 token...")
    token_result = obtain_token_example(target_merchant)

    if token_result and 'access_token' in token_result:
        access_token = token_result['access_token']
        print(f"✓ OAuth2 token obtained: {access_token[:20]}...")

        # Step 2: Validate the token
        print("\\n2. Validating OAuth2 token...")
        validation_result = validate_oauth2_token(access_token)

        if validation_result and validation_result.get('active'):
            print("✓ Token is valid and active")

            # Step 3: Use token for API calls
            print("\\n3. Token ready for API calls")
            print("You can now use this token with ISV JWT authentication")
        else:
            print("✗ Token validation failed")
    else:
        print("✗ Failed to obtain OAuth2 token")`;
  }

  getRequestBodySection(operation, opConfig, merchantPartnerId) {
    if (!opConfig.sampleBody) {
      return '# No request body needed for this operation\n        request_data = {}';
    }

    let body = { ...opConfig.sampleBody };

    // Customize body based on operation
    if (operation === 'obtain_token') {
      body.scope = `merchant:${merchantPartnerId} ${body.scope}`;
      body.client_id = 'client_id';  // Will be replaced by actual value
      body.client_secret = 'client_secret';  // Will be replaced by actual value
    }

    const bodyEntries = Object.entries(body)
      .map(([key, value]) => {
        if (key === 'client_id') {
          return "        'client_id': client_id,";
        } else if (key === 'client_secret') {
          return "        'client_secret': client_secret,";
        } else {
          return `        '${key}': '${value}',`;
        }
      })
      .join('\n');

    return `# Prepare OAuth2 request data
        request_data = {
${bodyEntries}
        }`;
  }

  getRequestSection(method) {
    if (method === 'GET') {
      return 'response = requests.get(url, headers=headers)';
    } else {
      return 'response = requests.post(url, data=request_data, headers=headers)';
    }
  }

  getResultProcessingSection(operation) {
    const processing = {
      obtain_token: `# Store token information
        access_token = result.get('access_token')
        token_type = result.get('token_type', 'Bearer')
        expires_in = result.get('expires_in')
        scope = result.get('scope')

        print(f"Access Token: {access_token[:20]}...")
        print(f"Token Type: {token_type}")
        print(f"Expires In: {expires_in} seconds")
        print(f"Scope: {scope}")

        # Store token for later use
        os.environ['OAUTH2_ACCESS_TOKEN'] = access_token`,

      get_token_info: `# Display token information
        active = result.get('active', False)
        scope = result.get('scope', 'N/A')
        client_id = result.get('client_id', 'N/A')
        expires_in = result.get('exp', 'N/A')

        print(f"Token Active: {active}")
        print(f"Client ID: {client_id}")
        print(f"Scope: {scope}")
        print(f"Expires: {expires_in}")`,

      list_active_tokens: `# Display active tokens
        tokens = result.get('tokens', [])
        print(f"Found {len(tokens)} active tokens:")
        for token in tokens:
            print(f"- Token ID: {token.get('id')}")
            print(f"  Scope: {token.get('scope')}")
            print(f"  Created: {token.get('created_at')}")
            print(f"  Expires: {token.get('expires_at')}")`
    };

    return processing[operation] || '# Process OAuth2 result as needed';
  }
}

/**
 * Node.js OAuth2 Generator
 */
export class NodeJSOAuth2Generator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = OAuth2Operations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const { merchantPartnerId = 'merchant_456', scope = 'merchant:full', ...otherParams } = params;
    const functionName = `${operation}Example`;

    return `async function ${functionName}(merchantPartnerId = '${merchantPartnerId}', scope = '${scope}', useSandbox = true) {
  /**
   * ${opConfig.description}
   */

  try {
    // Get OAuth2 configuration
    const clientId = process.env.PAYWARE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.PAYWARE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('Missing OAuth2 credentials in environment');
      return null;
    }

    // Get API configuration
    const baseUrl = getAPIBaseURL(useSandbox);
    const endpoint = '${opConfig.endpoint}';
    const url = \`\${baseUrl}\${endpoint}\`;

    ${this.getRequestBodySection(operation, opConfig, merchantPartnerId)}

    // OAuth2 requests use application/x-www-form-urlencoded
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Api-Version': '1'
    };

    ${this.getRequestSection(opConfig.method)}

    if (response.status === 200) {
      const result = response.data;
      console.log('${opConfig.description} successful:');
      console.log(JSON.stringify(result, null, 2));

      ${this.getResultProcessingSection(operation)}

      return result;
    } else {
      console.error(\`OAuth2 request failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }

  } catch (error) {
    if (error.response) {
      console.error(\`OAuth2 API Error: \${error.response.status} - \${error.response.data}\`);
    } else {
      console.error('OAuth2 Error:', error.message);
    }
    return null;
  }
}

async function getOAuth2TokenForMerchant(merchantPartnerId, scope = 'merchant:full', useSandbox = true) {
  /**
   * Convenience function to get OAuth2 token for specific merchant
   */

  const clientId = process.env.PAYWARE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.PAYWARE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing OAuth2 credentials');
  }

  const baseUrl = getAPIBaseURL(useSandbox);
  const url = \`\${baseUrl}/oauth2/token\`;

  const data = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: \`merchant:\${merchantPartnerId} \${scope}\`
  });

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Api-Version': '1'
  };

  try {
    const response = await axios.post(url, data, { headers });

    if (response.status === 200) {
      return response.data.access_token;
    } else {
      console.error(\`OAuth2 token request failed: \${response.status} - \${response.statusText}\`);
      return null;
    }

  } catch (error) {
    console.error('OAuth2 token error:', error.message);
    return null;
  }
}

async function validateOAuth2Token(accessToken, useSandbox = true) {
  /**
   * Validate OAuth2 token and get token information
   */

  const baseUrl = getAPIBaseURL(useSandbox);
  const url = \`\${baseUrl}/oauth2/token/info\`;

  const headers = {
    'Authorization': \`Bearer \${accessToken}\`,
    'Api-Version': '1'
  };

  try {
    const response = await axios.get(url, { headers });

    if (response.status === 200) {
      const tokenInfo = response.data;
      console.log('Token validation successful:');
      console.log(\`- Valid: \${tokenInfo.active || false}\`);
      console.log(\`- Scope: \${tokenInfo.scope || 'N/A'}\`);
      console.log(\`- Expires in: \${tokenInfo.expires_in || 'N/A'} seconds\`);
      return tokenInfo;
    } else {
      console.error(\`Token validation failed: \${response.status}\`);
      return null;
    }

  } catch (error) {
    console.error('Token validation error:', error.message);
    return null;
  }
}

// Example usage
async function main() {
  // Get target merchant from environment or use default
  const targetMerchant = process.env.PAYWARE_TARGET_MERCHANT_ID || 'merchant_example';

  console.log('=== OAuth2 Flow Example ===');

  try {
    // Step 1: Obtain OAuth2 token
    console.log('\\n1. Obtaining OAuth2 token...');
    const tokenResult = await obtainTokenExample(targetMerchant);

    if (tokenResult && tokenResult.access_token) {
      const accessToken = tokenResult.access_token;
      console.log(\`✓ OAuth2 token obtained: \${accessToken.substring(0, 20)}...\`);

      // Step 2: Validate the token
      console.log('\\n2. Validating OAuth2 token...');
      const validationResult = await validateOAuth2Token(accessToken);

      if (validationResult && validationResult.active) {
        console.log('✓ Token is valid and active');

        // Step 3: Use token for API calls
        console.log('\\n3. Token ready for API calls');
        console.log('You can now use this token with ISV JWT authentication');
      } else {
        console.log('✗ Token validation failed');
      }
    } else {
      console.log('✗ Failed to obtain OAuth2 token');
    }

  } catch (error) {
    console.error('OAuth2 flow error:', error.message);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}`;
  }

  getRequestBodySection(operation, opConfig, merchantPartnerId) {
    if (!opConfig.sampleBody) {
      return '// No request body needed for this operation\n    const requestData = new URLSearchParams();';
    }

    let body = { ...opConfig.sampleBody };

    // Customize body based on operation
    if (operation === 'obtain_token') {
      body.scope = `merchant:${merchantPartnerId} ${body.scope}`;
    }

    const bodyEntries = Object.entries(body)
      .map(([key, value]) => {
        if (key === 'client_id') {
          return "    requestData.append('client_id', clientId);";
        } else if (key === 'client_secret') {
          return "    requestData.append('client_secret', clientSecret);";
        } else {
          return `    requestData.append('${key}', '${value}');`;
        }
      })
      .join('\n');

    return `// Prepare OAuth2 request data
    const requestData = new URLSearchParams();
${bodyEntries}`;
  }

  getRequestSection(method) {
    if (method === 'GET') {
      return 'const response = await axios.get(url, { headers });';
    } else {
      return 'const response = await axios.post(url, requestData, { headers });';
    }
  }

  getResultProcessingSection(operation) {
    const processing = {
      obtain_token: `// Store token information
      const accessToken = result.access_token;
      const tokenType = result.token_type || 'Bearer';
      const expiresIn = result.expires_in;
      const scope = result.scope;

      console.log(\`Access Token: \${accessToken.substring(0, 20)}...\`);
      console.log(\`Token Type: \${tokenType}\`);
      console.log(\`Expires In: \${expiresIn} seconds\`);
      console.log(\`Scope: \${scope}\`);

      // Store token for later use
      process.env.OAUTH2_ACCESS_TOKEN = accessToken;`,

      get_token_info: `// Display token information
      const active = result.active || false;
      const scope = result.scope || 'N/A';
      const clientId = result.client_id || 'N/A';
      const expiresIn = result.exp || 'N/A';

      console.log(\`Token Active: \${active}\`);
      console.log(\`Client ID: \${clientId}\`);
      console.log(\`Scope: \${scope}\`);
      console.log(\`Expires: \${expiresIn}\`);`,

      list_active_tokens: `// Display active tokens
      const tokens = result.tokens || [];
      console.log(\`Found \${tokens.length} active tokens:\`);
      tokens.forEach(token => {
        console.log(\`- Token ID: \${token.id}\`);
        console.log(\`  Scope: \${token.scope}\`);
        console.log(\`  Created: \${token.created_at}\`);
        console.log(\`  Expires: \${token.expires_at}\`);
      });`
    };

    return processing[operation] || '// Process OAuth2 result as needed';
  }
}

/**
 * Export all generators
 */
export const OAuth2Generators = {
  python: PythonOAuth2Generator,
  nodejs: NodeJSOAuth2Generator,
  javascript: NodeJSOAuth2Generator
};

/**
 * Generate OAuth2 example
 */
export function generateOAuth2Example(operation, language = 'python', options = {}) {
  const GeneratorClass = OAuth2Generators[language];
  if (!GeneratorClass) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const generator = new GeneratorClass();
  return generator.generateExample(operation, 'isv', options);
}