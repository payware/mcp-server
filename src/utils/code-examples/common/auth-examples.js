/**
 * Authentication examples for all partner types and languages
 */

import { ExampleGenerator, CommonTemplates } from './helpers.js';

/**
 * Python authentication examples
 */
export class PythonAuthGenerator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getEnvironmentTemplate(partnerType, options = {}) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `${options.includeComments ? '# .env file configuration\n' : ''}${envString}

${options.includeComments ? '# Load environment variables\n' : ''}import os
from dotenv import load_dotenv
load_dotenv()`;
  }

  getDependenciesTemplate(options = {}) {
    return `${options.includeComments ? '# Install required dependencies:\n# pip install requests pyjwt cryptography python-dotenv\n\n' : ''}import requests
import jwt
import json
import hashlib
import base64
import os
from datetime import datetime, timedelta
from cryptography.hazmat.primitives import serialization`;
  }

  getAuthTemplate(partnerType, options = {}) {
    const isISV = partnerType === 'isv';

    return `def create_jwt_token(request_body=None, use_sandbox=True):
    ${options.includeComments ? '"""Create JWT token for payware API authentication"""\n\n    ' : ''}${options.includeComments ? '# Get configuration from environment\n    ' : ''}partner_id = os.getenv('PAYWARE_PARTNER_ID')
    if use_sandbox:
        private_key_path = os.getenv('PAYWARE_SANDBOX_PRIVATE_KEY_PATH')
    else:
        private_key_path = os.getenv('PAYWARE_PRODUCTION_PRIVATE_KEY_PATH')

    if not partner_id or not private_key_path:
        raise ValueError("Missing required environment variables")

    ${options.includeComments ? '# Load private key\n    ' : ''}with open(private_key_path, 'r') as f:
        private_key = f.read()

    ${options.includeComments ? '# Create JWT header\n    ' : ''}header = {
        'alg': 'RS256',
        'typ': 'JWT'
    }

    ${options.includeComments ? '# Add content SHA-256 for requests with body\n    ' : ''}body_string = None
    if request_body:
        body_string = create_minimized_json(request_body)
        content_sha256 = base64.b64encode(
            hashlib.sha256(body_string.encode('utf-8')).digest()
        ).decode('utf-8')
        header['contentSha256'] = content_sha256

    ${options.includeComments ? '# Create JWT payload\n    ' : ''}payload = {
        'iss': partner_id,
        'aud': 'https://payware.eu',
        'iat': int(datetime.utcnow().timestamp())
    }

    ${options.includeComments ? '# Create and return token\n    ' : ''}token = jwt.encode(payload, private_key, algorithm='RS256', headers=header)
    return token, body_string

def create_minimized_json(data):
    ${options.includeComments ? '"""Create deterministic minimized JSON for SHA-256 calculation"""\n    ' : ''}def sort_dict(obj):
        if isinstance(obj, dict):
            return {k: sort_dict(v) for k, v in sorted(obj.items())}
        elif isinstance(obj, list):
            return [sort_dict(item) for item in obj]
        else:
            return obj

    sorted_data = sort_dict(data)
    return json.dumps(sorted_data, separators=(',', ':'))

def get_api_headers(token):
    ${options.includeComments ? '"""Get standard API headers with authentication"""\n    ' : ''}return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Api-Version': '1'
    }

def get_api_base_url(use_sandbox=True):
    ${options.includeComments ? '"""Get API base URL based on environment"""\n    ' : ''}if use_sandbox:
        return os.getenv('PAYWARE_SANDBOX_URL', 'https://sandbox.payware.eu/api')
    else:
        return os.getenv('PAYWARE_PRODUCTION_URL', 'https://api.payware.eu/api')${isISV ? `

${options.includeComments ? '# ISV-specific OAuth2 authentication\n' : ''}def get_oauth2_token(merchant_partner_id):
    ${options.includeComments ? '"""Get OAuth2 token for ISV operations"""\n    ' : ''}client_id = os.getenv('PAYWARE_OAUTH_CLIENT_ID')
    client_secret = os.getenv('PAYWARE_OAUTH_CLIENT_SECRET')

    if not client_id or not client_secret:
        raise ValueError("Missing OAuth2 credentials")

    ${options.includeComments ? '# OAuth2 token request\n    ' : ''}token_data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': f'merchant:{merchant_partner_id}'
    }

    response = requests.post(
        f"{get_api_base_url()}/oauth2/token",
        data=token_data
    )

    if response.status_code == 200:
        return response.json()['access_token']
    else:
        raise Exception(f"OAuth2 token request failed: {response.text}")` : ''}`;
  }
}

/**
 * Node.js authentication examples
 */
export class NodeJSAuthGenerator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getEnvironmentTemplate(partnerType, options = {}) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `${options.includeComments ? '// .env file configuration\n' : ''}${envString}

${options.includeComments ? '// Load environment variables\n' : ''}require('dotenv').config();`;
  }

  getDependenciesTemplate(options = {}) {
    return `${options.includeComments ? '// Install required dependencies:\n// npm install axios jsonwebtoken crypto fs dotenv\n\n' : ''}const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();`;
  }

  getAuthTemplate(partnerType, options = {}) {
    const isISV = partnerType === 'isv';

    return `function createJWTToken(requestBody = null, useSandbox = true) {
  ${options.includeComments ? '// Get configuration from environment\n  ' : ''}const partnerId = process.env.PAYWARE_PARTNER_ID;
  const privateKeyPath = useSandbox ?
    process.env.PAYWARE_SANDBOX_PRIVATE_KEY_PATH :
    process.env.PAYWARE_PRODUCTION_PRIVATE_KEY_PATH;

  if (!partnerId || !privateKeyPath) {
    throw new Error('Missing required environment variables');
  }

  ${options.includeComments ? '// Load private key\n  ' : ''}const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  ${options.includeComments ? '// Create JWT header\n  ' : ''}const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  ${options.includeComments ? '// Add content SHA-256 for requests with body\n  ' : ''}let bodyString = null;
  if (requestBody) {
    bodyString = createMinimizedJSON(requestBody);
    const contentSha256 = crypto
      .createHash('sha256')
      .update(bodyString, 'utf8')
      .digest('base64');
    header.contentSha256 = contentSha256;
  }

  ${options.includeComments ? '// Create JWT payload\n  ' : ''}const payload = {
    iss: partnerId,
    aud: 'https://payware.eu',
    iat: Math.floor(Date.now() / 1000)
  };

  ${options.includeComments ? '// Create and return token\n  ' : ''}const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header
  });

  return { token, bodyString };
}

function createMinimizedJSON(data) {
  ${options.includeComments ? '// Sort object keys recursively for deterministic output\n  ' : ''}function sortObject(obj) {
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
}

function getAPIBaseURL(useSandbox = true) {
  if (useSandbox) {
    return process.env.PAYWARE_SANDBOX_URL || 'https://sandbox.payware.eu/api';
  } else {
    return process.env.PAYWARE_PRODUCTION_URL || 'https://api.payware.eu/api';
  }
}${isISV ? `

${options.includeComments ? '// ISV-specific OAuth2 authentication\n' : ''}async function getOAuth2Token(merchantPartnerId) {
  const clientId = process.env.PAYWARE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.PAYWARE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing OAuth2 credentials');
  }

  const tokenData = {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: \`merchant:\${merchantPartnerId}\`
  };

  try {
    const response = await axios.post(
      \`\${getAPIBaseURL()}/oauth2/token\`,
      tokenData
    );

    return response.data.access_token;
  } catch (error) {
    throw new Error(\`OAuth2 token request failed: \${error.response?.data || error.message}\`);
  }
}` : ''}`;
  }
}

/**
 * PHP authentication examples
 */
export class PHPAuthGenerator extends ExampleGenerator {
  constructor() {
    super('php');
  }

  getEnvironmentTemplate(partnerType, options = {}) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `<?php
${options.includeComments ? '// .env file configuration\n' : ''}${envString}

${options.includeComments ? '// Load environment variables\n' : ''}$dotenv = Dotenv\\Dotenv::createImmutable(__DIR__);
$dotenv->load();`;
  }

  getDependenciesTemplate(options = {}) {
    return `<?php
${options.includeComments ? '// Install required dependencies:\n// composer require firebase/php-jwt guzzlehttp/guzzle vlucas/phpdotenv\n\n' : ''}require_once 'vendor/autoload.php';

use Firebase\\JWT\\JWT;
use Firebase\\JWT\\Key;
use GuzzleHttp\\Client;
use GuzzleHttp\\Exception\\RequestException;`;
  }

  getAuthTemplate(partnerType, options = {}) {
    return `<?php
class PaywareAuth {

    public static function createJWTToken($requestBody = null, $useSandbox = true) {
        ${options.includeComments ? '// Get configuration from environment\n        ' : ''}$partnerId = $_ENV['PAYWARE_PARTNER_ID'];
        $privateKeyPath = $useSandbox ?
            $_ENV['PAYWARE_SANDBOX_PRIVATE_KEY_PATH'] :
            $_ENV['PAYWARE_PRODUCTION_PRIVATE_KEY_PATH'];

        if (!$partnerId || !$privateKeyPath) {
            throw new Exception('Missing required environment variables');
        }

        ${options.includeComments ? '// Load private key\n        ' : ''}$privateKey = file_get_contents($privateKeyPath);
        if (!$privateKey) {
            throw new Exception('Unable to load private key');
        }

        ${options.includeComments ? '// Create JWT header\n        ' : ''}$header = [
            'alg' => 'RS256',
            'typ' => 'JWT'
        ];

        ${options.includeComments ? '// Add content SHA-256 for requests with body\n        ' : ''}$bodyString = null;
        if ($requestBody) {
            $bodyString = self::createMinimizedJSON($requestBody);
            $contentSha256 = base64_encode(hash('sha256', $bodyString, true));
            $header['contentSha256'] = $contentSha256;
        }

        ${options.includeComments ? '// Create JWT payload\n        ' : ''}$payload = [
            'iss' => $partnerId,
            'aud' => 'https://payware.eu',
            'iat' => time()
        ];

        ${options.includeComments ? '// Create and return token\n        ' : ''}$token = JWT::encode($payload, $privateKey, 'RS256', null, $header);

        return [
            'token' => $token,
            'bodyString' => $bodyString
        ];
    }

    private static function createMinimizedJSON($data) {
        ${options.includeComments ? '// Sort array recursively for deterministic output\n        ' : ''}if (is_array($data)) {
            ksort($data);
            foreach ($data as $key => $value) {
                $data[$key] = self::createMinimizedJSON($value);
            }
        }

        return json_encode($data, JSON_UNESCAPED_SLASHES);
    }

    public static function getAPIHeaders($token) {
        return [
            'Authorization' => 'Bearer ' . $token,
            'Content-Type' => 'application/json',
            'Api-Version' => '1'
        ];
    }

    public static function getAPIBaseURL($useSandbox = true) {
        if ($useSandbox) {
            return $_ENV['PAYWARE_SANDBOX_URL'] ?? 'https://sandbox.payware.eu/api';
        } else {
            return $_ENV['PAYWARE_PRODUCTION_URL'] ?? 'https://api.payware.eu/api';
        }
    }
}
?>`;
  }
}

/**
 * Java authentication examples
 */
export class JavaAuthGenerator extends ExampleGenerator {
  constructor() {
    super('java');
  }

  getEnvironmentTemplate(partnerType, options = {}) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `${options.includeComments ? '// application.properties configuration\n' : ''}${envString}

${options.includeComments ? '// Load configuration in your application\n' : ''}@Configuration
@PropertySource("classpath:application.properties")
public class PaywareConfig {
    @Value("\${payware.partner.id}")
    private String partnerId;

    @Value("\${payware.sandbox.private.key.path}")
    private String sandboxPrivateKeyPath;

    ${options.includeComments ? '// ... other properties\n' : ''}
}`;
  }

  getDependenciesTemplate(options = {}) {
    return `${options.includeComments ? '// Add dependencies to pom.xml:\n/*\n<dependencies>\n    <dependency>\n        <groupId>io.jsonwebtoken</groupId>\n        <artifactId>jjwt-api</artifactId>\n        <version>0.11.5</version>\n    </dependency>\n    <dependency>\n        <groupId>io.jsonwebtoken</groupId>\n        <artifactId>jjwt-impl</artifactId>\n        <version>0.11.5</version>\n    </dependency>\n    <dependency>\n        <groupId>io.jsonwebtoken</groupId>\n        <artifactId>jjwt-jackson</artifactId>\n        <version>0.11.5</version>\n    </dependency>\n    <dependency>\n        <groupId>com.squareup.okhttp3</groupId>\n        <artifactId>okhttp</artifactId>\n        <version>4.10.0</version>\n    </dependency>\n    <dependency>\n        <groupId>com.fasterxml.jackson.core</groupId>\n        <artifactId>jackson-databind</artifactId>\n        <version>2.15.2</version>\n    </dependency>\n</dependencies>\n*/\n\n' : ''}import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import okhttp3.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.time.Instant;
import java.security.MessageDigest;`;
  }

  getAuthTemplate(partnerType, options = {}) {
    const isISV = partnerType === 'isv';

    return `public class PaywareAuthenticator {

    private static final String PAYWARE_AUDIENCE = "https://payware.eu";
    private String partnerId;
    private String privateKeyPath;
    private ObjectMapper objectMapper;
    private OkHttpClient httpClient;

    public PaywareAuthenticator(String partnerId, String privateKeyPath) {
        this.partnerId = partnerId;
        this.privateKeyPath = privateKeyPath;
        this.objectMapper = new ObjectMapper();
        this.httpClient = new OkHttpClient();
    }

    public TokenResult createJWTToken(Object requestBody, boolean useSandbox) throws Exception {
        ${options.includeComments ? '// Load private key\n        ' : ''}PrivateKey privateKey = loadPrivateKey();

        ${options.includeComments ? '// Create JWT header\n        ' : ''}Map<String, Object> header = new HashMap<>();
        header.put("alg", "RS256");
        header.put("typ", "JWT");

        ${options.includeComments ? '// Handle request body and SHA-256\n        ' : ''}String bodyString = null;
        if (requestBody != null) {
            bodyString = createMinimizedJSON(requestBody);
            String contentSha256 = calculateSHA256(bodyString);
            header.put("contentSha256", contentSha256);
        }

        ${options.includeComments ? '// Create JWT payload\n        ' : ''}Map<String, Object> payload = new HashMap<>();
        payload.put("iss", partnerId);
        payload.put("aud", PAYWARE_AUDIENCE);
        payload.put("iat", Instant.now().getEpochSecond());

        ${options.includeComments ? '// Create JWT token\n        ' : ''}String token = Jwts.builder()
            .setHeader(header)
            .setClaims(payload)
            .signWith(privateKey, SignatureAlgorithm.RS256)
            .compact();

        return new TokenResult(token, bodyString);
    }

    private PrivateKey loadPrivateKey() throws Exception {
        String keyContent = new String(Files.readAllBytes(Paths.get(privateKeyPath)));

        ${options.includeComments ? '// Remove PEM headers and whitespace\n        ' : ''}keyContent = keyContent
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replaceAll("\\\\s", "");

        byte[] keyBytes = Base64.getDecoder().decode(keyContent);
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");

        return keyFactory.generatePrivate(spec);
    }

    private String createMinimizedJSON(Object data) throws Exception {
        ${options.includeComments ? '// Sort keys recursively for deterministic output\n        ' : ''}JsonNode sortedNode = objectMapper.valueToTree(data);
        sortedNode = sortObjectKeys(sortedNode);

        return objectMapper.writeValueAsString(sortedNode);
    }

    private JsonNode sortObjectKeys(JsonNode node) {
        if (node.isObject()) {
            Map<String, JsonNode> sorted = new TreeMap<>();
            node.fields().forEachRemaining(entry -> {
                sorted.put(entry.getKey(), sortObjectKeys(entry.getValue()));
            });
            return objectMapper.valueToTree(sorted);
        } else if (node.isArray()) {
            List<JsonNode> sortedArray = new ArrayList<>();
            node.elements().forEachRemaining(element -> {
                sortedArray.add(sortObjectKeys(element));
            });
            return objectMapper.valueToTree(sortedArray);
        }
        return node;
    }

    private String calculateSHA256(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(input.getBytes("UTF-8"));
        return Base64.getEncoder().encodeToString(digest);
    }

    public Map<String, String> getAPIHeaders(String token) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + token);
        headers.put("Content-Type", "application/json");
        headers.put("Api-Version", "1");
        return headers;
    }

    public String getAPIBaseURL(boolean useSandbox) {
        if (useSandbox) {
            return System.getProperty("payware.sandbox.url", "https://sandbox.payware.eu/api");
        } else {
            return System.getProperty("payware.production.url", "https://api.payware.eu/api");
        }
    }${isISV ? `

    ${options.includeComments ? '// ISV-specific OAuth2 authentication\n    ' : ''}public String getOAuth2Token(String merchantPartnerId) throws Exception {
        String clientId = System.getProperty("payware.oauth.client.id");
        String clientSecret = System.getProperty("payware.oauth.client.secret");

        if (clientId == null || clientSecret == null) {
            throw new IllegalArgumentException("Missing OAuth2 credentials");
        }

        ${options.includeComments ? '// Create form data\n        ' : ''}FormBody formBody = new FormBody.Builder()
            .add("grant_type", "client_credentials")
            .add("client_id", clientId)
            .add("client_secret", clientSecret)
            .add("scope", "merchant:" + merchantPartnerId)
            .build();

        Request request = new Request.Builder()
            .url(getAPIBaseURL(true) + "/oauth2/token")
            .post(formBody)
            .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (response.isSuccessful()) {
                String responseBody = response.body().string();
                JsonNode jsonResponse = objectMapper.readTree(responseBody);
                return jsonResponse.get("access_token").asText();
            } else {
                throw new RuntimeException("OAuth2 token request failed: " + response.code());
            }
        }
    }` : ''}

    public static class TokenResult {
        private final String token;
        private final String bodyString;

        public TokenResult(String token, String bodyString) {
            this.token = token;
            this.bodyString = bodyString;
        }

        public String getToken() { return token; }
        public String getBodyString() { return bodyString; }
    }
}`;
  }
}

/**
 * C# authentication examples
 */
export class CSharpAuthGenerator extends ExampleGenerator {
  constructor() {
    super('csharp');
  }

  getEnvironmentTemplate(partnerType) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `// appsettings.json configuration
{
  "Payware": {
    "PartnerId": "YOUR_PARTNER_ID",
    "SandboxPrivateKeyPath": "keys/sandbox-${partnerType}-private-key.pem",
    "ProductionPrivateKeyPath": "keys/production-${partnerType}-private-key.pem",
    "SandboxUrl": "https://sandbox.payware.eu/api",
    "ProductionUrl": "https://api.payware.eu/api"${partnerType === 'isv' ? `,
    "OAuth": {
      "ClientId": "YOUR_OAUTH_CLIENT_ID",
      "ClientSecret": "YOUR_OAUTH_CLIENT_SECRET"
    }` : ''}
  }
}

// Or use environment variables (.env file)
// ${envString}`;
  }

  getDependenciesTemplate() {
    return `// Install NuGet packages:
// Install-Package System.IdentityModel.Tokens.Jwt
// Install-Package Microsoft.Extensions.Configuration
// Install-Package Newtonsoft.Json

using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Microsoft.Extensions.Configuration;`;
  }

  getAuthTemplate(partnerType) {
    const isISV = partnerType === 'isv';

    return `public class PaywareAuthenticator
{
    private const string PaywareAudience = "https://payware.eu";
    private readonly string _partnerId;
    private readonly string _privateKeyPath;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public PaywareAuthenticator(IConfiguration configuration)
    {
        _configuration = configuration;
        _partnerId = configuration["Payware:PartnerId"];
        _httpClient = new HttpClient();
    }

    public async Task<TokenResult> CreateJWTTokenAsync(object requestBody = null, bool useSandbox = true)
    {
        // Get private key path
        var keyPath = useSandbox
            ? _configuration["Payware:SandboxPrivateKeyPath"]
            : _configuration["Payware:ProductionPrivateKeyPath"];

        // Load private key
        var privateKey = LoadPrivateKey(keyPath);

        // Create JWT header
        var header = new Dictionary<string, object>
        {
            ["alg"] = "RS256",
            ["typ"] = "JWT"
        };

        // Handle request body and SHA-256
        string bodyString = null;
        if (requestBody != null)
        {
            bodyString = CreateMinimizedJSON(requestBody);
            var contentSha256 = CalculateSHA256(bodyString);
            header["contentSha256"] = contentSha256;
        }

        // Create JWT payload
        var payload = new Dictionary<string, object>
        {
            ["iss"] = _partnerId,
            ["aud"] = PaywareAudience,
            ["iat"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        };

        // Create JWT token
        var tokenHandler = new JwtSecurityTokenHandler();
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Claims = payload,
            SigningCredentials = new SigningCredentials(privateKey, SecurityAlgorithms.RsaSha256),
            AdditionalHeaderClaims = header
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        var tokenString = tokenHandler.WriteToken(token);

        return new TokenResult(tokenString, bodyString);
    }

    private RsaSecurityKey LoadPrivateKey(string keyPath)
    {
        var keyContent = File.ReadAllText(keyPath);

        // Remove PEM headers and whitespace
        keyContent = keyContent
            .Replace("-----BEGIN PRIVATE KEY-----", "")
            .Replace("-----END PRIVATE KEY-----", "")
            .Replace("\\n", "")
            .Replace("\\r", "")
            .Replace(" ", "");

        var keyBytes = Convert.FromBase64String(keyContent);

        var rsa = RSA.Create();
        rsa.ImportPkcs8PrivateKey(keyBytes, out _);

        return new RsaSecurityKey(rsa);
    }

    private string CreateMinimizedJSON(object data)
    {
        // Sort keys recursively for deterministic output
        var sortedData = SortObjectKeys(JToken.FromObject(data));
        return JsonConvert.SerializeObject(sortedData, Formatting.None);
    }

    private JToken SortObjectKeys(JToken token)
    {
        if (token is JObject obj)
        {
            var sorted = new JObject();
            foreach (var property in obj.Properties().OrderBy(p => p.Name))
            {
                sorted[property.Name] = SortObjectKeys(property.Value);
            }
            return sorted;
        }
        else if (token is JArray array)
        {
            var sortedArray = new JArray();
            foreach (var item in array)
            {
                sortedArray.Add(SortObjectKeys(item));
            }
            return sortedArray;
        }
        return token;
    }

    private string CalculateSHA256(string input)
    {
        using var sha256 = SHA256.Create();
        var inputBytes = Encoding.UTF8.GetBytes(input);
        var hashBytes = sha256.ComputeHash(inputBytes);
        return Convert.ToBase64String(hashBytes);
    }

    public Dictionary<string, string> GetAPIHeaders(string token)
    {
        return new Dictionary<string, string>
        {
            ["Authorization"] = $"Bearer {token}",
            ["Content-Type"] = "application/json",
            ["Api-Version"] = "1"
        };
    }

    public string GetAPIBaseURL(bool useSandbox = true)
    {
        if (useSandbox)
        {
            return _configuration["Payware:SandboxUrl"] ?? "https://sandbox.payware.eu/api";
        }
        else
        {
            return _configuration["Payware:ProductionUrl"] ?? "https://api.payware.eu/api";
        }
    }${isISV ? `

    // ISV-specific OAuth2 authentication
    public async Task<string> GetOAuth2TokenAsync(string merchantPartnerId)
    {
        var clientId = _configuration["Payware:OAuth:ClientId"];
        var clientSecret = _configuration["Payware:OAuth:ClientSecret"];

        if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
        {
            throw new ArgumentException("Missing OAuth2 credentials");
        }

        var formData = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("grant_type", "client_credentials"),
            new KeyValuePair<string, string>("client_id", clientId),
            new KeyValuePair<string, string>("client_secret", clientSecret),
            new KeyValuePair<string, string>("scope", $"merchant:{merchantPartnerId}")
        });

        var response = await _httpClient.PostAsync($"{GetAPIBaseURL()}/oauth2/token", formData);

        if (response.IsSuccessStatusCode)
        {
            var responseContent = await response.Content.ReadAsStringAsync();
            var jsonResponse = JObject.Parse(responseContent);
            return jsonResponse["access_token"]?.ToString();
        }
        else
        {
            throw new HttpRequestException($"OAuth2 token request failed: {response.StatusCode}");
        }
    }` : ''}

    public class TokenResult
    {
        public string Token { get; }
        public string BodyString { get; }

        public TokenResult(string token, string bodyString)
        {
            Token = token;
            BodyString = bodyString;
        }
    }
}`;
  }
}

/**
 * Go authentication examples
 */
export class GoAuthGenerator extends ExampleGenerator {
  constructor() {
    super('go');
  }

  getEnvironmentTemplate(partnerType) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `// .env file configuration
${envString}

// Load environment variables in Go
package main

import (
    "os"
    "github.com/joho/godotenv"
)

func init() {
    err := godotenv.Load()
    if err != nil {
        log.Fatal("Error loading .env file")
    }
}`;
  }

  getDependenciesTemplate() {
    return `// go.mod dependencies
// go mod init payware-client
// go get github.com/golang-jwt/jwt/v5
// go get github.com/joho/godotenv

package main

import (
    "crypto/sha256"
    "crypto/rsa"
    "crypto/x509"
    "encoding/base64"
    "encoding/json"
    "encoding/pem"
    "fmt"
    "io/ioutil"
    "net/http"
    "net/url"
    "os"
    "sort"
    "strings"
    "time"

    "github.com/golang-jwt/jwt/v5"
)`;
  }

  getAuthTemplate(partnerType) {
    const isISV = partnerType === 'isv';

    return `type PaywareConfig struct {
    PartnerID     string
    PrivateKeyPath string
    SandboxURL    string
    ProductionURL string${isISV ? `
    OAuthClientID     string
    OAuthClientSecret string` : ''}
}

type TokenResult struct {
    Token      string
    BodyString string
}

type PaywareAuthenticator struct {
    config PaywareConfig
    client *http.Client
}

func NewPaywareAuthenticator() *PaywareAuthenticator {
    config := PaywareConfig{
        PartnerID:     os.Getenv("PAYWARE_PARTNER_ID"),
        PrivateKeyPath: getPrivateKeyPath(),
        SandboxURL:    getEnvOrDefault("PAYWARE_SANDBOX_URL", "https://sandbox.payware.eu/api"),
        ProductionURL: getEnvOrDefault("PAYWARE_PRODUCTION_URL", "https://api.payware.eu/api"),${isISV ? `
        OAuthClientID:     os.Getenv("PAYWARE_OAUTH_CLIENT_ID"),
        OAuthClientSecret: os.Getenv("PAYWARE_OAUTH_CLIENT_SECRET"),` : ''}
    }

    return &PaywareAuthenticator{
        config: config,
        client: &http.Client{Timeout: 30 * time.Second},
    }
}

func (p *PaywareAuthenticator) CreateJWTToken(requestBody interface{}, useSandbox bool) (*TokenResult, error) {
    // Load private key
    privateKey, err := p.loadPrivateKey()
    if err != nil {
        return nil, fmt.Errorf("failed to load private key: %w", err)
    }

    // Create JWT header
    header := map[string]interface{}{
        "alg": "RS256",
        "typ": "JWT",
    }

    // Handle request body and SHA-256
    var bodyString string
    if requestBody != nil {
        bodyString, err = p.createMinimizedJSON(requestBody)
        if err != nil {
            return nil, fmt.Errorf("failed to create minimized JSON: %w", err)
        }

        contentSha256, err := p.calculateSHA256(bodyString)
        if err != nil {
            return nil, fmt.Errorf("failed to calculate SHA-256: %w", err)
        }
        header["contentSha256"] = contentSha256
    }

    // Create JWT claims
    claims := jwt.MapClaims{
        "iss": p.config.PartnerID,
        "aud": "https://payware.eu",
        "iat": time.Now().Unix(),
    }

    // Create JWT token
    token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
    token.Header = header

    tokenString, err := token.SignedString(privateKey)
    if err != nil {
        return nil, fmt.Errorf("failed to sign JWT token: %w", err)
    }

    return &TokenResult{
        Token:      tokenString,
        BodyString: bodyString,
    }, nil
}

func (p *PaywareAuthenticator) loadPrivateKey() (*rsa.PrivateKey, error) {
    keyData, err := ioutil.ReadFile(p.config.PrivateKeyPath)
    if err != nil {
        return nil, err
    }

    block, _ := pem.Decode(keyData)
    if block == nil {
        return nil, fmt.Errorf("failed to decode PEM block")
    }

    key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        return nil, err
    }

    rsaKey, ok := key.(*rsa.PrivateKey)
    if !ok {
        return nil, fmt.Errorf("key is not RSA private key")
    }

    return rsaKey, nil
}

func (p *PaywareAuthenticator) createMinimizedJSON(data interface{}) (string, error) {
    // Sort keys recursively for deterministic output
    sortedData := p.sortObjectKeys(data)

    jsonBytes, err := json.Marshal(sortedData)
    if err != nil {
        return "", err
    }

    return string(jsonBytes), nil
}

func (p *PaywareAuthenticator) sortObjectKeys(data interface{}) interface{} {
    switch v := data.(type) {
    case map[string]interface{}:
        keys := make([]string, 0, len(v))
        for k := range v {
            keys = append(keys, k)
        }
        sort.Strings(keys)

        sorted := make(map[string]interface{})
        for _, k := range keys {
            sorted[k] = p.sortObjectKeys(v[k])
        }
        return sorted

    case []interface{}:
        sorted := make([]interface{}, len(v))
        for i, item := range v {
            sorted[i] = p.sortObjectKeys(item)
        }
        return sorted

    default:
        return v
    }
}

func (p *PaywareAuthenticator) calculateSHA256(input string) (string, error) {
    hash := sha256.Sum256([]byte(input))
    return base64.StdEncoding.EncodeToString(hash[:]), nil
}

func (p *PaywareAuthenticator) GetAPIHeaders(token string) map[string]string {
    return map[string]string{
        "Authorization": "Bearer " + token,
        "Content-Type":  "application/json",
        "Api-Version":   "1",
    }
}

func (p *PaywareAuthenticator) GetAPIBaseURL(useSandbox bool) string {
    if useSandbox {
        return p.config.SandboxURL
    }
    return p.config.ProductionURL
}${isISV ? `

// ISV-specific OAuth2 authentication
func (p *PaywareAuthenticator) GetOAuth2Token(merchantPartnerID string) (string, error) {
    if p.config.OAuthClientID == "" || p.config.OAuthClientSecret == "" {
        return "", fmt.Errorf("missing OAuth2 credentials")
    }

    data := url.Values{}
    data.Set("grant_type", "client_credentials")
    data.Set("client_id", p.config.OAuthClientID)
    data.Set("client_secret", p.config.OAuthClientSecret)
    data.Set("scope", "merchant:"+merchantPartnerID)

    req, err := http.NewRequest("POST", p.GetAPIBaseURL(true)+"/oauth2/token", strings.NewReader(data.Encode()))
    if err != nil {
        return "", err
    }

    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    req.Header.Set("Api-Version", "1")

    resp, err := p.client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return "", fmt.Errorf("OAuth2 token request failed: %d", resp.StatusCode)
    }

    var tokenResponse struct {
        AccessToken string \`json:"access_token"\`
    }

    if err := json.NewDecoder(resp.Body).Decode(&tokenResponse); err != nil {
        return "", err
    }

    return tokenResponse.AccessToken, nil
}` : ''}

func getPrivateKeyPath() string {
    if sandbox := os.Getenv("PAYWARE_SANDBOX_PRIVATE_KEY_PATH"); sandbox != "" {
        return sandbox
    }
    return os.Getenv("PAYWARE_PRODUCTION_PRIVATE_KEY_PATH")
}

func getEnvOrDefault(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}`;
  }
}

/**
 * Ruby authentication examples
 */
export class RubyAuthGenerator extends ExampleGenerator {
  constructor() {
    super('ruby');
  }

  getEnvironmentTemplate(partnerType) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return `# .env file configuration
${envString}

# Load environment variables in Ruby
require 'dotenv/load'`;
  }

  getDependenciesTemplate() {
    return `# Gemfile dependencies
# gem 'jwt'
# gem 'httparty'
# gem 'dotenv'

require 'jwt'
require 'httparty'
require 'openssl'
require 'json'
require 'digest'
require 'base64'
require 'dotenv/load'`;
  }

  getAuthTemplate(partnerType) {
    const isISV = partnerType === 'isv';

    return `class PaywareAuthenticator
  PAYWARE_AUDIENCE = 'https://payware.eu'.freeze

  def initialize
    @partner_id = ENV['PAYWARE_PARTNER_ID']
    @private_key_path = private_key_path
    @sandbox_url = ENV['PAYWARE_SANDBOX_URL'] || 'https://sandbox.payware.eu/api'
    @production_url = ENV['PAYWARE_PRODUCTION_URL'] || 'https://api.payware.eu/api'${isISV ? `
    @oauth_client_id = ENV['PAYWARE_OAUTH_CLIENT_ID']
    @oauth_client_secret = ENV['PAYWARE_OAUTH_CLIENT_SECRET']` : ''}
  end

  def create_jwt_token(request_body = nil, use_sandbox = true)
    # Load private key
    private_key = load_private_key

    # Create JWT header
    header = {
      alg: 'RS256',
      typ: 'JWT'
    }

    # Handle request body and SHA-256
    body_string = nil
    if request_body
      body_string = create_minimized_json(request_body)
      content_sha256 = calculate_sha256(body_string)
      header[:contentSha256] = content_sha256
    end

    # Create JWT payload
    payload = {
      iss: @partner_id,
      aud: PAYWARE_AUDIENCE,
      iat: Time.now.to_i
    }

    # Create JWT token
    token = JWT.encode(payload, private_key, 'RS256', header)

    {
      token: token,
      body_string: body_string
    }
  rescue => e
    raise "Failed to create JWT token: #{e.message}"
  end

  def load_private_key
    key_content = File.read(@private_key_path)
    OpenSSL::PKey::RSA.new(key_content)
  rescue => e
    raise "Failed to load private key: #{e.message}"
  end

  def create_minimized_json(data)
    # Sort keys recursively for deterministic output
    sorted_data = sort_object_keys(data)
    JSON.generate(sorted_data, space: '', object_nl: '', array_nl: '')
  end

  def sort_object_keys(obj)
    case obj
    when Hash
      sorted_hash = {}
      obj.keys.sort.each do |key|
        sorted_hash[key] = sort_object_keys(obj[key])
      end
      sorted_hash
    when Array
      obj.map { |item| sort_object_keys(item) }
    else
      obj
    end
  end

  def calculate_sha256(input)
    digest = Digest::SHA256.digest(input)
    Base64.encode64(digest).strip
  end

  def api_headers(token)
    {
      'Authorization' => "Bearer #{token}",
      'Content-Type' => 'application/json',
      'Api-Version' => '1'
    }
  end

  def api_base_url(use_sandbox = true)
    use_sandbox ? @sandbox_url : @production_url
  end${isISV ? `

  # ISV-specific OAuth2 authentication
  def get_oauth2_token(merchant_partner_id)
    raise 'Missing OAuth2 credentials' if @oauth_client_id.nil? || @oauth_client_secret.nil?

    response = HTTParty.post(
      "#{api_base_url}/oauth2/token",
      body: {
        grant_type: 'client_credentials',
        client_id: @oauth_client_id,
        client_secret: @oauth_client_secret,
        scope: "merchant:#{merchant_partner_id}"
      },
      headers: {
        'Content-Type' => 'application/x-www-form-urlencoded',
        'Api-Version' => '1'
      }
    )

    if response.success?
      response.parsed_response['access_token']
    else
      raise "OAuth2 token request failed: #{response.code}"
    end
  end` : ''}

  private

  def private_key_path
    ENV['PAYWARE_SANDBOX_PRIVATE_KEY_PATH'] || ENV['PAYWARE_PRODUCTION_PRIVATE_KEY_PATH']
  end
end`;
  }
}

/**
 * cURL authentication examples
 */
export class CurlAuthGenerator extends ExampleGenerator {
  constructor() {
    super('curl');
  }

  getEnvironmentTemplate(partnerType) {
    const envVars = CommonTemplates.getEnvironmentVariables(partnerType);
    const envString = Object.entries(envVars)
      .map(([key, value]) => `export ${key}="${value}"`)
      .join('\n');

    return `#!/bin/bash
# Environment variables setup
${envString}

# Load environment variables
source .env`;
  }

  getDependenciesTemplate() {
    return `#!/bin/bash
# Required tools: curl, jq, openssl, base64
# Install on macOS: brew install jq
# Install on Ubuntu: apt-get install jq

# Check if required tools are available
command -v curl >/dev/null 2>&1 || { echo "curl is required but not installed"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required but not installed"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required but not installed"; exit 1; }`;
  }

  getAuthTemplate(partnerType) {
    const isISV = partnerType === 'isv';

    return `#!/bin/bash

# payware API Configuration
PAYWARE_AUDIENCE="https://payware.eu"
SANDBOX_URL="\${PAYWARE_SANDBOX_URL:-https://sandbox.payware.eu/api}"
PRODUCTION_URL="\${PAYWARE_PRODUCTION_URL:-https://api.payware.eu/api}"

# Function to create JWT token
create_jwt_token() {
    local request_body="$1"
    local use_sandbox="\${2:-true}"

    # Get private key path
    local private_key_path
    if [ "$use_sandbox" = "true" ]; then
        private_key_path="$PAYWARE_SANDBOX_PRIVATE_KEY_PATH"
    else
        private_key_path="$PAYWARE_PRODUCTION_PRIVATE_KEY_PATH"
    fi

    # Create JWT header
    local header='{"alg":"RS256","typ":"JWT"}'

    # Handle request body and SHA-256
    local body_string=""
    if [ -n "$request_body" ]; then
        body_string=$(echo "$request_body" | jq -S -c .)
        local content_sha256=$(echo -n "$body_string" | openssl dgst -sha256 -binary | base64)
        header=$(echo "$header" | jq --arg sha256 "$content_sha256" '. + {contentSha256: $sha256}')
    fi

    # Create JWT payload
    local iat=$(date +%s)
    local payload=$(jq -n \\
        --arg iss "$PAYWARE_PARTNER_ID" \\
        --arg aud "$PAYWARE_AUDIENCE" \\
        --argjson iat "$iat" \\
        '{iss: $iss, aud: $aud, iat: $iat}')

    # Encode header and payload
    local header_b64=$(echo -n "$header" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\\n')
    local payload_b64=$(echo -n "$payload" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\\n')
    local unsigned_token="\${header_b64}.\${payload_b64}"

    # Sign token
    local signature=$(echo -n "$unsigned_token" | \\
        openssl dgst -sha256 -sign "$private_key_path" | \\
        base64 | tr -d '=' | tr '/+' '_-' | tr -d '\\n')

    local token="\${unsigned_token}.\${signature}"

    echo "{\\"token\\": \\"$token\\", \\"body_string\\": \\"$body_string\\"}"
}

# Function to get API headers
get_api_headers() {
    local token="$1"
    echo "Authorization: Bearer $token"
    echo "Content-Type: application/json"
    echo "Api-Version: 1"
}

# Function to get API base URL
get_api_base_url() {
    local use_sandbox="\${1:-true}"
    if [ "$use_sandbox" = "true" ]; then
        echo "$SANDBOX_URL"
    else
        echo "$PRODUCTION_URL"
    fi
}${isISV ? `

# ISV-specific OAuth2 authentication
get_oauth2_token() {
    local merchant_partner_id="$1"

    if [ -z "$PAYWARE_OAUTH_CLIENT_ID" ] || [ -z "$PAYWARE_OAUTH_CLIENT_SECRET" ]; then
        echo "Error: Missing OAuth2 credentials" >&2
        return 1
    fi

    local response=$(curl -s -X POST \\
        "$(get_api_base_url)/oauth2/token" \\
        -H "Content-Type: application/x-www-form-urlencoded" \\
        -H "Api-Version: 1" \\
        -d "grant_type=client_credentials" \\
        -d "client_id=$PAYWARE_OAUTH_CLIENT_ID" \\
        -d "client_secret=$PAYWARE_OAUTH_CLIENT_SECRET" \\
        -d "scope=merchant:$merchant_partner_id")

    echo "$response" | jq -r '.access_token'
}` : ''}

# Example usage function
make_api_request() {
    local endpoint="$1"
    local method="\${2:-GET}"
    local request_body="$3"
    local use_sandbox="\${4:-true}"

    # Create JWT token
    local token_result=$(create_jwt_token "$request_body" "$use_sandbox")
    local token=$(echo "$token_result" | jq -r '.token')
    local body_string=$(echo "$token_result" | jq -r '.body_string')

    # Get API URL
    local base_url=$(get_api_base_url "$use_sandbox")
    local url="\${base_url}\${endpoint}"

    # Prepare curl command
    local curl_cmd="curl -s -X $method"

    # Add headers
    while IFS= read -r header; do
        curl_cmd="$curl_cmd -H \\"$header\\""
    done <<< "$(get_api_headers "$token")"

    # Add request body if present
    if [ -n "$body_string" ] && [ "$body_string" != "null" ]; then
        curl_cmd="$curl_cmd -d '$body_string'"
    fi

    # Add URL
    curl_cmd="$curl_cmd \\"$url\\""

    # Execute request
    eval "$curl_cmd"
}

# Example: Create transaction
create_transaction_example() {
    local request_body='{
        "trData": {
            "amount": "10.00",
            "currency": "EUR",
            "reasonL1": "Test transaction"
        },
        "trOptions": {
            "type": "PLAIN",
            "timeToLive": 120
        }
    }'

    echo "Creating transaction..."
    local response=$(make_api_request "/transactions" "POST" "$request_body")
    echo "$response" | jq .
}

# Example: Get transaction status
get_transaction_status_example() {
    local transaction_id="$1"

    echo "Getting transaction status for: $transaction_id"
    local response=$(make_api_request "/transactions/$transaction_id" "GET")
    echo "$response" | jq .
}`;
  }
}

/**
 * Export all authentication generators
 */
export const AuthGenerators = {
  python: PythonAuthGenerator,
  nodejs: NodeJSAuthGenerator,
  javascript: NodeJSAuthGenerator,
  php: PHPAuthGenerator,
  java: JavaAuthGenerator,
  csharp: CSharpAuthGenerator,
  go: GoAuthGenerator,
  ruby: RubyAuthGenerator,
  curl: CurlAuthGenerator
};