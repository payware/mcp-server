# payware MCP Server

[![npm version](https://badge.fury.io/js/%40payware%2Fmcp-server.svg)](https://www.npmjs.com/package/@payware/mcp-server)

Official MCP (Model Context Protocol) server for payware payment API integration. This server enables AI assistants to interact with payware APIs, automating integration workflows for all partner types.

Releases are published to npm as `@payware/mcp-server` and to the official [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.payware/mcp-server`. MIT licensed, see [LICENSE](LICENSE).

## Who Is This For?

- **Merchants** - Accept payments, manage products, generate transaction reports
- **ISVs (Independent Software Vendors)** - Build multi-merchant platforms with OAuth2 token management
- **Payment Institutions** - Process A2A transfers, handle Payment Choice Architecture with multiple payment methods

## What's New in 2.2.1

- **Partial product and schedule updates** - `update_product` and `update_schedule` send only the fields you give, and payware keeps every stored value the request leaves out. 2.2.0 read the product first and sent it whole, which payware refuses once the product's start date has passed
- **ISV product images** - `payware_products_get_product_image` works for an ISV acting for a merchant, on the merchant's plan and for products in the shops the merchant assigned to the ISV
- **ISV reports, two ways** - with a merchant's token an ISV runs that merchant's reports, limited to the shops the merchant assigned to it; without one, its own reports on everything it handled. Each request is found only in the context it was run in

## What's New in 2.2.0

- **Execution lock** - A payment institution finalizes with `EXECUTING` immediately before money moves, then `CONFIRMED` once the Merchant Leg has completed, or `FAILED`; `transferType` and `feeLegOutcome` are new
- **Deferred Merchant Leg** - Merchants, and ISVs for them, can allow a credit transfer that settles later with `deferredAllowed`
- **Code examples** - `payware_generate_code_example` writes complete, signed programs for real routes only, including the institution finalize flow

## Features

### 🔐 Authentication Tools
- **RSA Key Generation**: Generate secure 2048-bit RSA key pairs
- **JWT Token Creation**: Create properly formatted JWT tokens
- **Sandbox Setup**: Configure sandbox authentication

### 💳 Transaction Tools
- **Create Transaction**: Support PLAIN, QR, and BARCODE transactions
- **Process Transaction**: Process transactions with Payment Choice Architecture support
- **Transaction Status**: Check transaction status by ID
- **Transaction History**: Get finalized transaction details
- **Callback Simulation**: Test callback scenarios for merchants and payment institutions

### 📍 Point of Interaction (POI) Tools
- **Set Price**: Configure POI with amount, currency, and payment details
- **Cancel Price**: Clear active price from POI
- **Get POI**: Retrieve POI details and current state
- **Get Status**: Check POI transaction status
- **Get QR Code**: Generate QR code for POI payments
- **List POIs**: List all POIs for a merchant

### 📣 Campaign, Placement and Airing Tools
For merchants, and for ISVs acting for them. Changes need the merchant's PRM plan; reading works on every plan.
- **Placements**: Distribute a product through posters, TV spots, packaging, links or tags, each with its own `pl` ID, so every payment it starts is attributed to it. Includes the QR code, barcode and short link of each placement
- **Campaigns**: Group placements, across products, and read their combined results
- **Airing Rules**: Schedule when a placement is on air, with recurrences, time windows and time zones, and replace a whole schedule in one call
- **Airing Calendar**: Every airing across all products in a time range
- **Results**: Offers shown, payments started and confirmed, and confirmed amounts per placement or campaign

### 📋 Logs Tools (Premium)
- **Query Logs**: Search and filter application logs by level, logger, message content, and date range
- **Log Status**: Check log availability and storage information
- **Download Logs**: Get compressed archive of logs for offline analysis

### 🛠️ Utility Tools
- **Code Examples**: A complete program for one API call, or the JWT helper, in Python, Node.js, PHP, Java, C# or curl, signed as payware requires and calling the real route
- **Integration Overview**: Base URLs, request signing and every operation the code examples cover, per partner type
- **Request Formatting**: Format and validate API requests

## Quick Start

### 1. Installation

**From npm (recommended):**
```bash
npm install -g @payware/mcp-server
```

**From source:**
```bash
git clone https://github.com/payware/mcp-server.git
cd mcp-server
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

#### Choosing toolsets

Every tool definition goes into the assistant's context on every turn, and a merchant has over 70 of them. To offer only the groups you use, set `PAYWARE_MCP_TOOLSETS` to a comma-separated list:

```env
PAYWARE_MCP_TOOLSETS=products,placements
```

Toolsets: `auth`, `transactions`, `products`, `placements`, `data`, `logs`, `poi`, `shops`, `onboarding`, `utils`. Unset, or `all`, loads every tool. An unknown name is ignored with a warning in the server log. A tool outside the chosen toolsets is neither listed nor callable; this narrows what the assistant is offered and does not change what your partner account may do. An ISV that obtains OAuth2 tokens through this server includes `auth`.

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
    "qrFormat": "PNG",              // PNG, JPG, SVG (default: SVG)
    "qrBorder": 4,                  // Border modules: 1-10 (default: 4)
    "qrErrorCorrection": "QUARTILE", // LOW, MEDIUM, QUARTILE, HIGH (default: QUARTILE)
    "qrScale": 16,                  // Pixel size: 1-100 (default: 16, irrelevant for SVG)
    "qrVersion": 10                 // QR version: 1-40 (default: 3)
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
| `type`, `timeToLive`, `deferredAllowed` | `trOptions` object | Transaction behavior (`deferredAllowed`: the merchant's opt-in to a deferred Merchant Leg, sent only when true) |
| `qrFormat`, `qrBorder`, etc. | `qrOptions` object | QR code settings (when type=QR) |
| `barFormat`, `barModuleWidth`, etc. | `barOptions` object | Barcode settings (when type=BARCODE) |

## Available Tools

### Code Generation & Documentation

#### `payware_generate_code_example`
**A complete program for one payware API call, in Python, Node.js, PHP, Java, C# or curl**

Each program signs its request with an RS256 JWT (`contentSha256` for a body; on behalf of a merchant for an ISV, except the OAuth2 endpoints) and calls a route the server has. The operations, by partner type:

- **Transactions** (all): create_transaction, get_transaction_status, process_transaction, cancel_transaction, get_transaction_history
- **Institution finalize** (payment_institution): finalize_transaction, the whole flow - process, then `EXECUTING` immediately before money moves, then `CONFIRMED` once the Merchant Leg has completed or `FAILED`, on `PATCH /api/transactions/{transactionId}`
- **Products and audio** (merchant, isv): create_product, get_product, list_products, update_product, delete_product, register_audio, get_audios, get_audio, update_audio, delete_audio
- **OAuth2** (isv): obtain_token, get_token_info, rotate_token
- **Reports** (all, production only): list_reports, generate_report, get_report_status, export_report
- **authentication**: the JWT helper on its own

#### `payware_generate_documentation`
**An integration overview for one partner type**

Base URLs, how requests are signed, and every operation above that the partner type has, with its route.

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
- ⏳ **ACTIVE**: Active transaction pending processing or finalizing. Once the payer's institution has started the payment it stays ACTIVE past `timeToLive` until the money has moved (seconds for an instant transfer, days with `deferredAllowed`), so never infer EXPIRED from the clock
- This is the only status returned by `payware_operations_get_transaction_status` (a payment institution also sees `EXECUTING` on a transaction it has locked)
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
- `currency` (required): ISO 4217 code payware knows (an unknown code is refused)
- `reasonL1` (required): Transaction description (max 100 chars)
- `partnerId` (required): Partner ID from payware dashboard
- `privateKey` (required): RSA private key for JWT signing
- `amount` (optional): Currency value (default: "0.00" for flexible amounts)
- `type` (optional): PLAIN, QR, or BARCODE (default: PLAIN)
- `timeToLive` (optional): Payment timeout in seconds, 60-600 (default: 120)
- `deferredAllowed` (optional): `true` lets the payer's institution pay by a credit transfer that settles later; refused with producer or terminal fields (`ERR_DEFERRED_TRANSFER_NOT_ALLOWED`). A deferred payment stays ACTIVE until it settles, which can take days

**QR Options** (when type=QR):
- `qrFormat`: PNG, JPG, SVG (default: SVG)
- `qrErrorCorrection`: LOW, MEDIUM, QUARTILE, HIGH (default: QUARTILE)
- `qrScale` (1-100, default 16), `qrBorder` (1-10, default 4), `qrVersion` (1-40, default 3): size and appearance

**Barcode Options** (when type=BARCODE):
- `barFormat`: PNG, SVG, JPG (default: SVG)
- `barModuleWidth` (1-10, default 2), `barBarHeight` (15-1000, default 100), `barFontSize` (0-24, default 12), `barHumanReadableLocation` (NONE, BOTTOM, TOP, default NONE)

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
Generate a complete program for one payware API call. The operations are listed under Code Generation & Documentation above.

**Parameters:**
- `operation` (required): the operation, for example `create_transaction` or `finalize_transaction`
- `language` (optional): python, nodejs, php, java, csharp, curl (default: python)
- `partner_type` (optional): merchant, isv, payment_institution (default: merchant)
- `include_comments` (optional): the program with comments, inside a page naming the route (default: true); false gives the program alone
- `include_error_handling` (optional): report a failed status or a network error (default: true)

The programs read `PAYWARE_PARTNER_ID` and `PAYWARE_PRIVATE_KEY_PATH` (a PKCS#8 PEM), `PAYWARE_BASE_URL` when set, and for an ISV's call on behalf of a merchant `PAYWARE_MERCHANT_PARTNER_ID` and `PAYWARE_OAUTH2_TOKEN`.

#### `payware_generate_documentation`
An integration overview for one partner type.

**Parameters:**
- `language` (optional): the language the next steps refer to (default: python)
- `partner_type` (optional): merchant, isv, payment_institution (default: merchant)

#### `payware_utils_format_request`
Format and validate API requests with deterministic JSON serialization for SHA-256 consistency.

**Parameters:**
- `type` (required): transaction, headers, or curl
- `data` (optional): Data to format
- `jwtToken` (optional): JWT token for headers
- `signature` (optional): Request signature
- `endpoint` (optional): API endpoint for curl
- `method` (optional): HTTP method (default: POST)

#### `payware_utils_format_json_deterministic`
Format JSON with deterministic property ordering for consistent SHA-256 calculation.

**Parameters:**
- `data` (required): Object to serialize
- `minimize` (optional): Remove whitespace (default: true)

#### `payware_utils_server_info`
Get MCP server information and configuration.

**Note:** All transaction data is serialized using consistent property ordering to prevent content hash mismatch errors.

## Dependencies

- `@modelcontextprotocol/sdk`: MCP server framework
- `axios`: HTTP client for API calls
- `jsonwebtoken`: JWT token creation
- `dotenv`: reads `.env`
- `express`, `cors`: the HTTP proxy mode only

RSA keys are generated with Node's own `crypto`, and multipart uploads use Node's own `FormData`.

## Environment

- **Sandbox by default, production on request**: tools that call payware take `useSandbox` (default `true`); `false` calls production and signs with the production key (`PAYWARE_PRODUCTION_PRIVATE_KEY_PATH`). Reports run on production only.
- **Base URLs**: `https://sandbox.payware.eu/api` and `https://api.payware.eu/api`; the OAuth2 endpoints sit at the host root (`/oauth2/...`); soundbite recognition has its own hosts, `https://soundbite-sandbox.payware.eu/api` and `https://soundbite.payware.eu/api`
- **Currencies**: any ISO 4217 code payware knows; amounts follow the currency's minor unit
- **Transaction media types**: PLAIN, QR, BARCODE

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
- Calls go to sandbox unless a tool is given `useSandbox: false`
- Keep sandbox and production keys apart: each environment refuses the other's signature
- Implement proper error handling in production
- Use HTTPS for all API communications
- Validate all input parameters
- Implement rate limiting and monitoring

### JSON Serialization & SHA-256 Consistency
⚠️ **CRITICAL**: payware API requires deterministic JSON serialization for SHA-256 calculation

- **Property Order**: JSON objects must have consistent property ordering
- **Minimized Format**: No whitespace or formatting in request bodies
- **SHA-256 Calculation**: Must be calculated from the exact same JSON string sent to API
- **Implementation**: This server uses deterministic JSON serialization to ensure consistency

**Example of correct JSON format:**
```json
{"trData":{"amount":"25.50","currency":"EUR","reasonL1":"Payment description"},"trOptions":{"timeToLive":300,"type":"PLAIN"}}
```

**Why this matters:**
- Different property orders produce different SHA-256 hashes
- Hash mismatch results in `ERR_INVALID_CONTENT_HASH` errors
- Server validates that JWT `contentSha256` matches request body SHA-256

## Troubleshooting

### Common Issues

1. **Authentication Failed (ERR_INVALID_SIGNATURE)**
   - **Root Cause**: Public key registered with payware doesn't match your private key
   - **Solution**: Ensure the public key registered on payware site corresponds to your private key
   - **Verification**: Use `openssl rsa -in privateKey.pem -pubout` to extract public key from private key
   - **Status**: ✅ Resolved - Keys must be properly registered on payware partner portal

2. **Content Hash Mismatch Error (ERR_INVALID_CONTENT_HASH)**
   - **Root Cause**: Inconsistent JSON property ordering
   - **Solution**: Use deterministic JSON serialization (implemented in this server)
   - **Symptoms**: Server logs show different expected vs actual SHA-256 hashes
   - **Prevention**: Always use `createMinimizedJSON()` from `/src/core/utils/json-serializer.js`
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

`npm test` runs every tool of every role against a local fake payware server (no credentials, no network): verb and path against the server's routes, the JWT and its `contentSha256`, sandbox against production keys, the server's validation rules for the fields the tools send, and the MCP result shape, including `isError` on a refusal. The fake server is a model of payware, not payware: the suite does not call the real sandbox, so a server change it does not model can still break a tool.

### Support

For issues related to:
- **MCP Server**: Check server logs and MCP client configuration
- **payware API**: Refer to payware documentation and sandbox status  
- **Integration**: Use code examples and formatting tools provided
- **Key Issues**: Ensure public key is registered on payware partner portal

## License

MIT License