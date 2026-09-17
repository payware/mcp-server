/**
 * ISV OAuth2 authentication flow examples
 *
 * Everything here targets the OAuth2 surface payware actually serves (Oauth2Controller):
 *
 *   POST /oauth2/tokens                  request a token for a merchant
 *   GET  /oauth2/tokens                  list this ISV's tokens
 *   GET  /oauth2/tokens/{token}          status of one token
 *   POST /oauth2/tokens/{token}/rotate   rotate the credential, keeping the authorization
 *
 * These generators used to emit /oauth2/token, /oauth2/token/info, /oauth2/token/simple,
 * /oauth2/token/refresh and /oauth2/token/revoke - none of which exist - with form-encoded,
 * snake_case bodies and an OAuth2 `scope` parameter payware has never accepted. The live mcp tools
 * always called the right endpoints, which is exactly why nobody noticed: the defect only reached
 * integrators who shipped the generated code. They got 404s on the URLs (loud) and, worse, designed
 * token handling around refresh and revoke semantics that do not exist (silent).
 *
 * The real contract: JSON body, camelCase fields, no scope. `clientId` is the merchant's partnerId
 * and `clientSecret` is that merchant's secret, base64-encoded. A new token is PENDING until the
 * merchant grants it; credentials expire (expiresIn seconds, 180 days by default) and are renewed by
 * requesting again with the same client credentials - the merchant does not re-consent - or by
 * rotating. There is no revoke call: authorization ends on the merchant's side.
 */

import { ExampleGenerator } from '../common/helpers.js';

/**
 * OAuth2 operations for ISV
 */
export const OAuth2Operations = {
  obtain_token: {
    description: 'Request an OAuth2 token for a merchant (PENDING until the merchant grants it)',
    endpoint: '/oauth2/tokens',
    method: 'POST',
    sampleBody: {
      grantType: 'client_credentials',
      clientId: 'MERCHANT_PARTNER_ID',
      clientSecret: 'BASE64_ENCODED_MERCHANT_SECRET'
    }
  },

  get_token_info: {
    description: 'Get the status of one token (PENDING / GRANTED / REVOKED)',
    endpoint: '/oauth2/tokens/{token}',
    method: 'GET',
    sampleBody: null
  },

  rotate_token: {
    description: 'Rotate a token credential, keeping the merchant authorization it was granted under',
    endpoint: '/oauth2/tokens/{token}/rotate',
    method: 'POST',
    sampleBody: null
  },

  list_active_tokens: {
    description: 'List all OAuth2 tokens for this ISV',
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

    const { merchantPartnerId = 'MERCHANT_PARTNER_ID' } = params;
    const functionName = `${operation}_example`;

    return `def ${functionName}(merchant_partner_id='${merchantPartnerId}', token='EXISTING_TOKEN', use_sandbox=True):
    """${opConfig.description}

    OAuth2 endpoints live outside /api, so the base URL has no /api suffix, and they are
    authenticated with the ISV's signed JWT like every other payware call.
    """

    try:
        # The merchant's secret, base64-encoded - not the ISV's own credentials
        merchant_secret = os.getenv('PAYWARE_MERCHANT_SECRET')

        # OAuth2 endpoints are served from the host root, not from /api
        base_url = get_api_base_url(use_sandbox).replace('/api', '')
        endpoint = '${opConfig.endpoint}'.replace('{token}', token)
        url = f"{base_url}{endpoint}"

${this.getRequestBodySection(operation, opConfig)}

        # JSON, and no Api-Version header on OAuth2 calls
        headers = {
            'Authorization': f'Bearer {create_isv_jwt(request_data, audience="https://payware.eu")}',
            'Content-Type': 'application/json'
        }

        ${this.getRequestSection(opConfig.method)}

        if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} - OK")
            print(json.dumps(result, indent=2))

${this.getResultProcessingSection(operation)}
            return result
        else:
            print(f"OAuth2 request failed with status {response.status_code}: {response.text}")
            return None

    except requests.exceptions.RequestException as e:
        print(f"OAuth2 request error: {str(e)}")
        return None


def get_oauth2_token_for_merchant(merchant_partner_id, use_sandbox=True):
    """Request a token for one merchant. Returns the accessToken, PENDING until granted."""

    merchant_secret = os.getenv('PAYWARE_MERCHANT_SECRET')
    if not merchant_secret:
        raise ValueError("Missing merchant secret")

    base_url = get_api_base_url(use_sandbox).replace('/api', '')
    url = f"{base_url}/oauth2/tokens"

    request_data = {
        'grantType': 'client_credentials',
        'clientId': merchant_partner_id,
        'clientSecret': base64.b64encode(merchant_secret.encode()).decode()
    }

    headers = {
        'Authorization': f'Bearer {create_isv_jwt(request_data, audience="https://payware.eu")}',
        'Content-Type': 'application/json'
    }

    response = requests.post(url, json=request_data, headers=headers)

    if response.status_code == 200:
        # camelCase: accessToken, tokenType, status, expiresIn, scope
        return response.json()['accessToken']

    print(f"OAuth2 token request failed: {response.status_code} - {response.text}")
    return None


def get_token_status(token, use_sandbox=True):
    """Status of an existing token: PENDING, GRANTED or REVOKED."""

    base_url = get_api_base_url(use_sandbox).replace('/api', '')
    url = f"{base_url}/oauth2/tokens/{token}"

    headers = {
        'Authorization': f'Bearer {create_isv_jwt(None, audience="https://payware.eu")}'
    }

    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        info = response.json()
        print(f"- Status:     {info.get('status')}")
        print(f"- Client ID:  {info.get('clientId')}")
        print(f"- Scope:      {info.get('scope')}")
        print(f"- Expires in: {info.get('expiresIn')} seconds")
        return info

    print(f"Token status request failed: {response.status_code}")
    return None


# Example usage
if __name__ == "__main__":
    target_merchant = os.getenv('PAYWARE_TARGET_MERCHANT_ID', 'MERCHANT_PARTNER_ID')

    print("=== OAuth2 Flow ===")

    print("\\n1. Requesting a token for the merchant...")
    access_token = get_oauth2_token_for_merchant(target_merchant)

    if access_token:
        print(f"OK - token: {access_token[:20]}...")

        print("\\n2. Checking its status...")
        info = get_token_status(access_token)

        if info and info.get('status') == 'GRANTED':
            print("The merchant has granted authorization - the token can be used.")
        else:
            print("Still PENDING: the merchant has to grant it in the payware portal.")
    else:
        print("Failed to obtain an OAuth2 token")`;
  }

  getRequestBodySection(operation, opConfig) {
    if (!opConfig.sampleBody) {
      return '        # No request body for this operation\n        request_data = None';
    }

    return `        # JSON body, camelCase fields - clientSecret is base64 of the merchant's secret
        request_data = {
            'grantType': 'client_credentials',
            'clientId': merchant_partner_id,
            'clientSecret': base64.b64encode(merchant_secret.encode()).decode()
        }`;
  }

  getRequestSection(method) {
    if (method === 'GET') {
      return 'response = requests.get(url, headers=headers)';
    }
    return 'response = requests.post(url, json=request_data, headers=headers)';
  }

  getResultProcessingSection(operation) {
    const processing = {
      obtain_token: `            access_token = result.get('accessToken')
            print(f"Access Token: {access_token[:20]}...")
            print(f"Token Type:   {result.get('tokenType')}")
            print(f"Status:       {result.get('status')}")
            print(f"Expires In:   {result.get('expiresIn')} seconds")`,

      get_token_info: `            print(f"Status:     {result.get('status')}")
            print(f"Client ID:  {result.get('clientId')}")
            print(f"Scope:      {result.get('scope')}")
            print(f"Expires In: {result.get('expiresIn')} seconds")`,

      rotate_token: `            print(f"New Access Token: {result.get('accessToken')}")
            print(f"Status:           {result.get('status')}")
            print("Store the new credential; the previous one stops working.")`,

      list_active_tokens: `            for token_info in result:
                print(f"- {token_info.get('accessToken')} ({token_info.get('status')})"
                      f" client={token_info.get('clientId')}")`
    };

    return processing[operation] || '            # Process the OAuth2 result as needed';
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

    const { merchantPartnerId = 'MERCHANT_PARTNER_ID' } = params;
    const functionName = `${operation}Example`;

    return `async function ${functionName}(merchantPartnerId = '${merchantPartnerId}', token = 'EXISTING_TOKEN', useSandbox = true) {
  /**
   * ${opConfig.description}
   *
   * OAuth2 endpoints live outside /api, so the base URL has no /api suffix, and they are
   * authenticated with the ISV's signed JWT like every other payware call.
   */

  try {
    // The merchant's secret, base64-encoded - not the ISV's own credentials
    const merchantSecret = process.env.PAYWARE_MERCHANT_SECRET;

    // OAuth2 endpoints are served from the host root, not from /api
    const baseUrl = getAPIBaseURL(useSandbox).replace('/api', '');
    const endpoint = '${opConfig.endpoint}'.replace('{token}', token);
    const url = \`\${baseUrl}\${endpoint}\`;

${this.getRequestBodySection(operation, opConfig)}

    // JSON, and no Api-Version header on OAuth2 calls
    const headers = {
      'Authorization': \`Bearer \${createISVJWT(requestData, 'https://payware.eu')}\`,
      'Content-Type': 'application/json'
    };

    ${this.getRequestSection(opConfig.method)}

    const result = response.data;
    console.log('${opConfig.description} - OK');
    console.log(JSON.stringify(result, null, 2));

${this.getResultProcessingSection(operation)}

    return result;

  } catch (error) {
    if (error.response) {
      console.error(\`OAuth2 API Error: \${error.response.status} - \${JSON.stringify(error.response.data)}\`);
    } else {
      console.error('OAuth2 Error:', error.message);
    }
    return null;
  }
}

async function getOAuth2TokenForMerchant(merchantPartnerId, useSandbox = true) {
  /**
   * Request a token for one merchant. Returns the accessToken, PENDING until the merchant grants it.
   */

  const merchantSecret = process.env.PAYWARE_MERCHANT_SECRET;
  if (!merchantSecret) {
    throw new Error('Missing merchant secret');
  }

  const baseUrl = getAPIBaseURL(useSandbox).replace('/api', '');
  const url = \`\${baseUrl}/oauth2/tokens\`;

  const requestData = {
    grantType: 'client_credentials',
    clientId: merchantPartnerId,
    clientSecret: Buffer.from(merchantSecret).toString('base64')
  };

  const headers = {
    'Authorization': \`Bearer \${createISVJWT(requestData, 'https://payware.eu')}\`,
    'Content-Type': 'application/json'
  };

  const response = await axios.post(url, requestData, { headers });
  // camelCase: accessToken, tokenType, status, expiresIn, scope
  return response.data.accessToken;
}

async function getTokenStatus(token, useSandbox = true) {
  /**
   * Status of an existing token: PENDING, GRANTED or REVOKED.
   */

  const baseUrl = getAPIBaseURL(useSandbox).replace('/api', '');
  const url = \`\${baseUrl}/oauth2/tokens/\${token}\`;

  const headers = {
    'Authorization': \`Bearer \${createISVJWT(null, 'https://payware.eu')}\`
  };

  const response = await axios.get(url, { headers });
  const info = response.data;

  console.log(\`- Status:     \${info.status}\`);
  console.log(\`- Client ID:  \${info.clientId}\`);
  console.log(\`- Scope:      \${info.scope}\`);
  console.log(\`- Expires in: \${info.expiresIn} seconds\`);

  return info;
}

// Example usage
async function main() {
  const targetMerchant = process.env.PAYWARE_TARGET_MERCHANT_ID || 'MERCHANT_PARTNER_ID';

  console.log('=== OAuth2 Flow ===');

  try {
    console.log('\\n1. Requesting a token for the merchant...');
    const accessToken = await getOAuth2TokenForMerchant(targetMerchant);

    if (accessToken) {
      console.log(\`OK - token: \${accessToken.substring(0, 20)}...\`);

      console.log('\\n2. Checking its status...');
      const info = await getTokenStatus(accessToken);

      if (info && info.status === 'GRANTED') {
        console.log('The merchant has granted authorization - the token can be used.');
      } else {
        console.log('Still PENDING: the merchant has to grant it in the payware portal.');
      }
    }
  } catch (error) {
    console.error('OAuth2 flow error:', error.message);
  }
}

if (require.main === module) {
  main().catch(console.error);
}`;
  }

  getRequestBodySection(operation, opConfig) {
    if (!opConfig.sampleBody) {
      return '    // No request body for this operation\n    const requestData = null;';
    }

    return `    // JSON body, camelCase fields - clientSecret is base64 of the merchant's secret
    const requestData = {
      grantType: 'client_credentials',
      clientId: merchantPartnerId,
      clientSecret: Buffer.from(merchantSecret).toString('base64')
    };`;
  }

  getRequestSection(method) {
    if (method === 'GET') {
      return 'const response = await axios.get(url, { headers });';
    }
    return 'const response = await axios.post(url, requestData, { headers });';
  }

  getResultProcessingSection(operation) {
    const processing = {
      obtain_token: `    console.log(\`Access Token: \${result.accessToken.substring(0, 20)}...\`);
    console.log(\`Token Type:   \${result.tokenType}\`);
    console.log(\`Status:       \${result.status}\`);
    console.log(\`Expires In:   \${result.expiresIn} seconds\`);`,

      get_token_info: `    console.log(\`Status:     \${result.status}\`);
    console.log(\`Client ID:  \${result.clientId}\`);
    console.log(\`Scope:      \${result.scope}\`);
    console.log(\`Expires In: \${result.expiresIn} seconds\`);`,

      rotate_token: `    console.log(\`New Access Token: \${result.accessToken}\`);
    console.log(\`Status:           \${result.status}\`);
    console.log('Store the new credential; the previous one stops working.');`,

      list_active_tokens: `    result.forEach(tokenInfo => {
      console.log(\`- \${tokenInfo.accessToken} (\${tokenInfo.status}) client=\${tokenInfo.clientId}\`);
    });`
    };

    return processing[operation] || '    // Process the OAuth2 result as needed';
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
