# payware MCP Server

Minimal MCP server for payware API integration. Enables quick merchant integration with payware APIs in sandbox environment.

## Features

### 🔐 Authentication Tools
- **RSA Key Generation**: Generate secure 2048-bit RSA key pairs
- **JWT Token Creation**: Create properly formatted JWT tokens  
- **Sandbox Setup**: Configure sandbox authentication

### 💳 Transaction Tools
- **Create Transaction**: Support PLAIN, QR, and BARCODE transactions
- **Transaction Status**: Check transaction status by ID
- **Callback Simulation**: Test callback scenarios

### 🛠️ Utility Tools
- **Advanced Code Generation**: Generate complete integration code across 8 languages (Python, Node.js, PHP, Java, C#, Go, Ruby, cURL) with 16+ framework support
- **Framework Integration**: Framework-specific examples for Django, FastAPI, Express, NestJS, Laravel, Spring Boot, ASP.NET, and more
- **Real-world Scenarios**: Generate complete integration scenarios (e-commerce, ISV multi-merchant, P2P payments)
- **Comprehensive Documentation**: Auto-generate complete API documentation with code examples
- **Request Formatting**: Format and validate API requests

## Quick Start

### 1. Installation

```bash
cd payware/mcp
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env` file:

```env
# Partner ID from payware dashboard
PAYWARE_PARTNER_ID=your_partner_id_here

# Path to private key file (relative to project root)
PAYWARE_SANDBOX_PRIVATE_KEY_PATH=keys/sandbox-your-private-key.pem
PAYWARE_PRODUCTION_PRIVATE_KEY_PATH=keys/production-your-private-key.pem

# Optional: Sandbox base URL (defaults to https://sandbox.payware.eu/api)
PAYWARE_SANDBOX_URL=https://sandbox.payware.eu/api
```

⚠️ **Security Note**: Never commit the `.env` file to version control. It contains sensitive credentials.

### 3. Start the MCP Server

```bash
npm start
```

### 4. Basic Integration Flow

1. **Generate RSA Keys**
   ```
   Tool: payware_authentication_generate_rsa_keys
   ```

2. **Create JWT Token**
   ```
   Tool: payware_authentication_create_jwt_token
   Parameters:
   - partnerId: (from PAYWARE_PARTNER_ID)
   - privateKey: (from environment-specific key path)
   ```

3. **Setup Sandbox**
   ```
   Tool: payware_authentication_setup_sandbox_auth
   Parameters:
   - partnerId: (from PAYWARE_PARTNER_ID)
   ```

4. **Create Transaction**
   ```
   Tool: payware_operations_create_transaction
   Parameters:
   - partnerId: (from PAYWARE_PARTNER_ID)
   - privateKey: (from environment-specific key path)
   - amount: 10.00
   - currency: EUR
   - reasonL1: "Payment description"
   - type: PLAIN
   ```

5. **Check Status**
   ```
   Tool: payware_operations_get_transaction_status
   Parameters:
   - partnerId: (from PAYWARE_PARTNER_ID)
   - privateKey: (from environment-specific key path)
   - transactionId: TRANSACTION_ID
   ```

## API Request Structure

The payware MCP server transforms flat parameter inputs into the proper nested JSON structure required by the payware API:

### Create Transaction Request Structure
```json
{
  // ROOT LEVEL - Transaction metadata
  "shop": "SHOP001",                    // Optional: Shop code
  "account": "GB29NWBK60161331926810",  // Optional: Account identifier
  "friendlyName": "Your Shop Name",     // Optional: Account holder name
  "callbackUrl": "https://callback.url", // Optional: HTTPS callback URL
  "passbackParams": "{\"orderId\":\"12345\"}", // Optional: Callback parameters
  
  // TRANSACTION DATA - Required transaction information
  "trData": {
    "amount": "25.50",              // String/Number: Amount (can be "0.00" for flexible amounts)
    "currency": "EUR",              // REQUIRED: ISO 3-character currency code
    "reasonL1": "Payment for services", // REQUIRED: Transaction description (max 100 chars)
    "reasonL2": "Order #12345"      // Optional: Additional description (max 100 chars)
  },
  
  // TRANSACTION OPTIONS - Transaction behavior settings
  "trOptions": {
    "type": "QR",                   // PLAIN, QR, or BARCODE (default: PLAIN)
    "timeToLive": 300               // Seconds: 60-600 (default: 120)
  },
  
  // QR OPTIONS - Only included when type=QR
  "qrOptions": {
    "qrFormat": "PNG",              // PNG, SVG, JPG, GIF, BMP (default: SVG)
    "qrBorder": 4,                  // Border modules: 1-10 (default: 4)
    "qrErrorCorrection": "QUARTILE", // LOW, MEDIUM, QUARTILE, HIGH (default: QUARTILE)
    "qrScale": 16,                  // Pixel size: 1-100 (default: 16, irrelevant for SVG)
    "qrVersion": 10                 // QR version: 1-40 (default: 10, auto if not specified)
  },
  
  // BARCODE OPTIONS - Only included when type=BARCODE
  "barOptions": {
    "barFormat": "SVG",             // PNG, SVG, JPG (default: SVG)
    "barModuleWidth": 2,            // Module width: 1-10 (default: 2)
    "barBarHeight": 100,            // Height: 15-1000 (default: 100)
    "barFontSize": 12,              // Font size: 0-24 (default: 12)
    "barHumanReadableLocation": "NONE" // NONE, BOTTOM, TOP (default: NONE)
  }
}
```

### Parameter Mapping

When using MCP tools, parameters are automatically mapped to the correct API structure:

| MCP Tool Parameter | API Location | Description |
|------------------|-------------|-------------|
| `partnerId`, `privateKey` | Authentication | Used for JWT signing, not sent in request |
| `account`, `friendlyName`, `shop`, `callbackUrl`, `passbackParams` | Root Level | Transaction metadata |
| `amount`, `currency`, `reasonL1`, `reasonL2` | `trData` object | Core transaction data |
| `type`, `timeToLive` | `trOptions` object | Transaction behavior |
| `qrFormat`, `qrBorder`, etc. | `qrOptions` object | QR code settings (when type=QR) |
| `barFormat`, `barModuleWidth`, etc. | `barOptions` object | Barcode settings (when type=BARCODE) |

## Available Tools

### Code Generation & Documentation

#### `payware_generate_code_example`
**Advanced multi-language code generation with framework support**

Supports 60+ operations across all partner types:
- **Transactions**: create_transaction, get_transaction_status, cancel_transaction, process_transaction, get_transaction_history, simulate_callback
- **Products**: create_product, get_product, update_product, delete_product, list_products, get_product_image, create_schedule, update_schedule, delete_schedule, list_schedules
- **OAuth2** (ISV only): obtain_token, get_token_info, create_token_simple, refresh_token, revoke_token, list_active_tokens
- **Data**: generate_report, get_report_status, export_report, download_export, cancel_report, list_reports, get_analytics_summary, create_custom_report
- **Deep Links**: get_transaction_link, get_product_link, create_custom_link, delete_transaction_link, delete_product_link, list_active_links, get_link_analytics, create_batch_links
- **P2P** (Payment Institution): initiate_p2p_transfer, accept_p2p_transfer, reject_p2p_transfer, get_p2p_transfer_status, list_p2p_transfers, cancel_p2p_transfer, create_p2p_link, get_p2p_analytics
- **Soundbites** (Payment Institution): register_audio, get_audio, update_audio, delete_audio, list_audios, create_soundbite_transaction, stream_audio, download_audio, get_soundbite_analytics, create_audio_playlist, get_audio_preview

#### `payware_generate_documentation`
**Comprehensive documentation generator**

Generates complete API documentation with working code examples for any partner type and programming language combination.

### Authentication

#### `payware_authentication_generate_rsa_keys`
Generate RSA key pair for API authentication.

**Parameters:**
- `keySize` (optional): RSA key size in bits (default: 2048)

#### `payware_authentication_create_jwt_token`
Create JWT token for API authentication.

**Parameters:**
- `partnerId` (required): Partner ID from payware
- `privateKey` (required): RSA private key in PEM format

#### `payware_authentication_validate_jwt`
Validate JWT token format and signature.

**Parameters:**
- `token` (required): JWT token to validate
- `partnerId` (required): Partner ID for validation

#### `payware_authentication_test_jwt`
Test JWT token with payware API.

**Parameters:**
- `token` (required): JWT token to test
- `partnerId` (required): Partner ID

#### `payware_authentication_setup_sandbox_auth`
Setup sandbox authentication configuration.

**Parameters:**
- `partnerId` (required): Partner ID from payware
- `privateKey` (optional): Private key for validation

### Transactions

#### Transaction Status Overview

payware transactions can have the following statuses:

**ACTIVE Status:**
- ⏳ **ACTIVE**: Active transaction pending processing or finalizing
- This is the only status returned by `payware_transactions_get_transaction_status`
- Use GET `/transactions/{id}` endpoint

**Final Statuses:**
- ✅ **CONFIRMED**: Successfully finalized
- ❌ **DECLINED**: Declined by the user, processing or finalizing payment institutions  
- 💥 **FAILED**: Failed due to technical reasons or other
- ⏰ **EXPIRED**: Time to live of the transaction has passed
- 🚫 **CANCELLED**: Transaction canceled by the originator

These final statuses are only available through `payware_operations_get_transaction_history` using GET `/transactions-history/{id}` endpoint.

#### `payware_operations_create_transaction`
Create a new transaction with full API structure support.

**Key Parameters:**
- `currency` (required): ISO 3-character code (EUR, USD, GBP, etc.)
- `reasonL1` (required): Transaction description (max 100 chars)
- `partnerId` (required): Partner ID from payware dashboard
- `privateKey` (required): RSA private key for JWT signing
- `amount` (optional): Currency value (default: "0.00" for flexible amounts)
- `type` (optional): PLAIN, QR, or BARCODE (default: PLAIN)
- `timeToLive` (optional): Payment timeout in seconds, 60-600 (default: 120)

**QR Options** (when type=QR):
- `qrFormat`: PNG, SVG, JPG, GIF, BMP (default: SVG)
- `qrErrorCorrection`: LOW, MEDIUM, QUARTILE, HIGH (default: QUARTILE)
- `qrScale`, `qrBorder`, `qrVersion`: Size and appearance settings

**Barcode Options** (when type=BARCODE):
- `barFormat`: PNG, SVG, JPG (default: SVG)
- `barModuleWidth`, `barBarHeight`, `barFontSize`: Size settings

#### `payware_operations_get_transaction_status`
Get status of ACTIVE transactions only. For completed/finalized transactions use history tool.

**Parameters:**
- `transactionId` (required): Transaction ID (starts with 'pw')
- `partnerId` (required): Partner ID
- `privateKey` (required): Private key for JWT signing

#### `payware_operations_simulate_callback`
Simulate callback scenarios for testing.

**Parameters:**
- `transactionId` (required): Transaction ID
- `status` (optional): CONFIRMED, DECLINED, FAILED, EXPIRED, or CANCELLED (default: CONFIRMED)
- `callbackUrl` (optional): URL where callback would be sent
- `amount` (optional): Transaction amount (default: 10.00)
- `currency` (optional): Currency (default: EUR)
- `type` (optional): Transaction type (default: PLAIN)

### Utilities

#### `payware_generate_code_example`
Generate production-ready code examples for any payware operation.

**Parameters:**
- `operation` (required): Operation to generate - see complete list below
- `language` (optional): python, nodejs, php, java, csharp, curl (default: python)
- `partner_type` (optional): merchant, isv, payment_institution (default: merchant)
- `include_comments` (optional): Include detailed code comments (default: true)
- `include_error_handling` (optional): Include comprehensive error handling (default: true)

**Available Operations by Category:**

**Authentication:**
- `authentication` - JWT authentication setup

**Transaction Operations (all partner types):**
- `create_transaction` - Create a new payment transaction
- `get_transaction_status` - Get transaction status and details
- `process_transaction` - Process a pending transaction
- `cancel_transaction` - Cancel a pending transaction

**Product Operations (merchant, isv):**
- `create_product` - Create a new product
- `get_product` - Get product details
- `list_products` - List all products

**OAuth2 Operations (isv only):**
- `obtain_token` - Obtain OAuth2 access token
- `get_token_info` - Get OAuth2 token information

**Data Operations (all partner types):**
- `generate_report` - Generate analytics report
- `get_report_status` - Get report generation status

**P2P Operations (payment_institution only):**
- `initiate_p2p_transfer` - Initiate peer-to-peer transfer
- `accept_p2p_transfer` - Accept P2P transfer

**Deep Links (all partner types):**
- `get_transaction_link` - Get deep link for transaction

**Soundbites (payment_institution only):**
- `register_audio` - Register audio content for soundbite transactions

#### `payware_generate_documentation`
Generate comprehensive API documentation with code examples.

**Parameters:**
- `language` (optional): Target programming language (default: python)
- `partnerType` (optional): merchant, isv, payment_institution (default: merchant)
- `includeScenarios` (optional): Include real-world integration scenarios (default: true)
- `outputFormat` (optional): markdown, html, json (default: markdown)

#### `payware_utils_format_request`
Format and validate API requests with deterministic JSON serialization for MD5 consistency.

**Parameters:**
- `type` (required): transaction, headers, or curl
- `data` (optional): Data to format
- `jwtToken` (optional): JWT token for headers
- `signature` (optional): Request signature
- `endpoint` (optional): API endpoint for curl
- `method` (optional): HTTP method (default: POST)

#### `payware_utils_format_json_deterministic`
Format JSON with deterministic property ordering for consistent MD5 calculation.

**Parameters:**
- `data` (required): Object to serialize
- `minimize` (optional): Remove whitespace (default: true)

#### `payware_utils_server_info`
Get MCP server information and configuration.

**Note:** All transaction data is serialized using consistent property ordering to prevent MD5 mismatch errors.

## Dependencies

- `@modelcontextprotocol/sdk`: MCP server framework
- `axios`: HTTP client for API calls
- `jsonwebtoken`: JWT token creation
- `node-forge`: RSA key generation

## Environment

- **Sandbox Only**: All API calls are restricted to sandbox environment
- **Base URL**: `https://sandbox.payware.eu/api/v1`
- **Supported Currencies**: EUR, USD, GBP
- **Supported Transaction Types**: PLAIN, QR, BARCODE

## Security

⚠️ **Important Security Notes:**

### Environment Variables
- **REQUIRED**: Use environment variables for all credentials
- Never commit `.env` files to version control
- Use different credentials for development and production
- Store private key files outside web-accessible directories

### Private Key Security
- Generate separate key pairs for sandbox and production
- Store private keys with restricted file permissions (600)
- Never embed private keys in source code
- Rotate keys regularly according to security policies

### API Security
- This server is designed for sandbox testing only
- Never use sandbox keys in production environment
- Implement proper error handling in production
- Use HTTPS for all API communications
- Validate all input parameters
- Implement rate limiting and monitoring

### JSON Serialization & MD5 Consistency
⚠️ **CRITICAL**: payware API requires deterministic JSON serialization for MD5 calculation

- **Property Order**: JSON objects must have consistent property ordering
- **Minimized Format**: No whitespace or formatting in request bodies
- **MD5 Calculation**: Must be calculated from the exact same JSON string sent to API
- **Implementation**: This server uses deterministic JSON serialization to ensure consistency

**Example of correct JSON format:**
```json
{"trData":{"amount":"25.50","currency":"EUR","reasonL1":"Payment description"},"trOptions":{"timeToLive":300,"type":"PLAIN"}}
```

**Why this matters:**
- Different property orders produce different MD5 hashes
- MD5 mismatch results in `ContentMd5 mismatch` errors
- Server validates that JWT contentMd5 matches request body MD5

## Troubleshooting

### Common Issues

1. **Authentication Failed (ERR_INVALID_SIGNATURE)**
   - **Root Cause**: Public key registered with payware doesn't match your private key
   - **Solution**: Ensure the public key registered on payware site corresponds to your private key
   - **Verification**: Use `openssl rsa -in privateKey.pem -pubout` to extract public key from private key
   - **Status**: ✅ Resolved - Keys must be properly registered on payware partner portal

2. **ContentMd5 Mismatch Error**
   - **Root Cause**: Inconsistent JSON property ordering
   - **Solution**: Use deterministic JSON serialization (implemented in this server)
   - **Symptoms**: Server logs show different expected vs actual MD5 hashes
   - **Prevention**: Always use `createMinimizedJSON()` from `/src/utils/json-serializer.js`
   - **Status**: ✅ Fixed - Deterministic JSON serialization implemented

3. **Transaction Creation Failed**
   - Ensure all required parameters are provided
   - Check amount is non-negative
   - Verify transaction type is supported
   - **Status**: ✅ Working - Create and cancel operations confirmed functional

4. **MCP Connection Issues**
   - Ensure server is started with `npm start`
   - Check that MCP client is properly configured
   - Verify no firewall blocking stdio communication
   - **Note**: Use MCP Inspector (`npm run inspector`) for debugging

### Proxy and Bridge Tools

**HTTP Proxy Server** (`npm run proxy`):
- Bridges MCP tools to HTTP REST API
- Useful for testing tools via HTTP requests
- Documentation: `README-proxy.md`

**MCP Bridge** (`npm run bridge`):
- Connects MCP server to MCP Inspector
- Essential for debugging and development
- Use with: `npm run inspector`

### Testing Status

**✅ Confirmed Working Operations:**
- JWT token creation with RS256 algorithm
- Transaction creation (POST /api/transactions)
- Transaction cancellation (PATCH /api/transactions/{id})
- Deterministic JSON serialization for MD5 consistency
- Public/private key pair validation

**🧪 Test Results:**
- All MCP tools tested successfully with real payware sandbox API
- Both create and cancel transaction flows working end-to-end
- Signature validation resolved with proper key registration

### Support

For issues related to:
- **MCP Server**: Check server logs and MCP client configuration
- **payware API**: Refer to payware documentation and sandbox status  
- **Integration**: Use code examples and formatting tools provided
- **Key Issues**: Ensure public key is registered on payware partner portal

## License

MIT License