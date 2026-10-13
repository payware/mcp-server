# payware MCP Proxy Server

This proxy server provides HTTP/REST access to your payware MCP server, making it accessible from MCP Inspector and other web-based tools.

## Quick Start

1. **Start the proxy server:**
   ```bash
   npm run proxy
   ```

2. **Access the API:**
   - Documentation: http://localhost:3001
   - Health check: http://localhost:3001/health
   - List tools: http://localhost:3001/tools

## Available Endpoints

### GET `/health`
Health check endpoint
```json
{
  "status": "healthy",
  "timestamp": "2025-01-11T...",
  "service": "payware-mcp-proxy",
  "version": "1.0.0"
}
```

### GET `/tools`
List all available MCP tools
```json
{
  "tools": [
    {
      "name": "generate_rsa_keys",
      "description": "Generate RSA key pair for payware API authentication"
    }
  ]
}
```

### POST `/tools/:toolName`
Call a specific MCP tool

**Example: Generate RSA Keys**
```bash
curl -X POST http://localhost:3001/tools/payware_authentication_generate_rsa_keys \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Example: Create JWT Token**
```bash
curl -X POST http://localhost:3001/tools/payware_authentication_create_jwt_token \
  -H "Content-Type: application/json" \
  -d '{
    "partnerId": "your_partner_id",
    "privateKey": "-----BEGIN RSA PRIVATE KEY-----\nMIIE...your key content...\n-----END RSA PRIVATE KEY-----"
  }'
```

**Flexible Private Key Formats:**
```bash
# Full PEM format (traditional)
{
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAA...\n-----END RSA PRIVATE KEY-----"
}

# Base64 content only (headers added automatically)
{
  "privateKey": "MIIEowIBAAKCAQEA5jJkCSnodXCCKTM6OBxWFk3t3rynQKNLxAmeCFAjF1NvJGvwLkvaxUVT2O17HlPWvqh0LPWoeGDwIk8UYkucWHLzYMvKUSpdhNZvWQ8RSwtXix53..."
}

# Mixed format (normalized automatically)
{
  "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEowIBAAKCAQEA5jJkCSnodXCC..."
}
```

### POST `/mcp`
Generic MCP method call
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "generate_rsa_keys",
      "arguments": {}
    }
  }'
```

## Configuration

Set custom port:
```bash
PROXY_PORT=8080 npm run proxy
```

| Variable | Default | Purpose |
|---|---|---|
| `PROXY_PORT` | `3001` | Port to listen on. |
| `PAYWARE_MCP_PROXY_HOST` | `127.0.0.1` | Interface to bind. Anything other than loopback exposes the routes to the network and prints a warning. |
| `PAYWARE_MCP_PROXY_HOSTS` | `localhost:<port>,127.0.0.1:<port>,<bind host>:<port>` | Comma-separated `host:port` values accepted in the `Host` header. Every other value is refused with 403. |
| `PAYWARE_MCP_PROXY_ORIGINS` | `http://localhost:<port>,http://127.0.0.1:<port>` | Comma-separated browser origins allowed to call the proxy. A request from any other `Origin` is refused with 403; requests without an `Origin` (curl, scripts) are accepted. |

## Using with MCP Inspector

1. Start the proxy server:
   ```bash
   npm run proxy
   ```

2. In MCP Inspector, connect to:
   ```
   http://localhost:3001
   ```

3. The proxy server will handle the HTTP-to-MCP translation automatically.

## Development

Run with auto-reload:
```bash
npm run proxy:dev
```

## Security Notes

- The routes are unauthenticated and sign API requests with the configured partner's private key, so anyone who can reach the proxy can act as that partner. It binds to loopback by default; widen `PAYWARE_MCP_PROXY_HOST` only on a network you control.
- Requests whose `Host` header is not an allowed name are refused. This blocks DNS rebinding, where a web page re-points its own hostname at `127.0.0.1` and then calls the proxy as if it were same-origin.
- Requests from a browser origin that is not allowed are refused before they reach a route, including simple cross-site POSTs that need no CORS preflight.
- For anything beyond local development, use the stdio server (`npm start`), which opens no network port.

## Troubleshooting

1. **Port already in use:**
   ```bash
   PROXY_PORT=3002 npm run proxy
   ```

2. **MCP server not responding:**
   - Ensure your MCP server tools are working with `npm start`
   - Check console logs for errors

3. **403 Forbidden:**
   - The `Host` or `Origin` of the request is not allowed. Add it to `PAYWARE_MCP_PROXY_HOSTS` or `PAYWARE_MCP_PROXY_ORIGINS`