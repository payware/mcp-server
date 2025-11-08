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
curl -X POST http://localhost:3001/tools/generate_rsa_keys \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Example: Create JWT Token**
```bash
curl -X POST http://localhost:3001/tools/payware_auth_create_jwt_token \
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

- The proxy binds to `0.0.0.0` to allow external access
- Use appropriate firewall rules in production
- Consider adding authentication for production use
- CORS is enabled for all origins (adjust as needed)

## Troubleshooting

1. **Port already in use:**
   ```bash
   PROXY_PORT=3002 npm run proxy
   ```

2. **MCP server not responding:**
   - Ensure your MCP server tools are working with `npm start`
   - Check console logs for errors

3. **CORS issues:**
   - The proxy includes CORS headers, but some browsers may still block requests
   - Use a proper HTTP client or configure your browser appropriately