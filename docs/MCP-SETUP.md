# payware MCP Server Configuration

This document explains how to configure the payware MCP server for use with Claude Code or other MCP clients.

## Configuration Files

### 1. `mcp-config.json` - Simple Configuration
Basic MCP server configuration for Claude Code:

```json
{
  "mcpServers": {
    "payware": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "."
    }
  }
}
```

### 2. `payware-mcp-config.json` - Production Configuration
Enhanced configuration with environment variables:

```json
{
  "mcpServers": {
    "payware": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "/mnt/d/git/payware/mcp",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 3. `claude-code-config.json` - Full Documentation
Complete configuration with metadata and documentation.

## Setup Instructions

### For Claude Code Users

1. **Choose Configuration File**
   - Use `mcp-config.json` for simple setup
   - Use `payware-mcp-config.json` for production
   - Use `claude-code-config.json` for full documentation

2. **Configure Claude Code**
   - Copy the chosen configuration to your Claude Code MCP settings
   - Update the `cwd` path to match your payware MCP server location
   - Ensure Node.js is available in your PATH

3. **Start payware MCP Server**
   ```bash
   cd /path/to/payware/mcp
   npm install
   node src/index.js
   ```

4. **Test Connection**
   - Open Claude Code
   - Try using `payware_generate_code_example` tool
   - Verify the server responds correctly

### Environment Setup

Create a `.env` file in the payware MCP directory:

```env
# API Configuration
PAYWARE_SANDBOX_URL=https://sandbox.payware.eu/api
PAYWARE_PRODUCTION_URL=https://api.payware.eu/api

# Partner Configuration (set these for testing)
PAYWARE_PARTNER_ID=your_partner_id
PAYWARE_PRIVATE_KEY_FILE=keys/private-key.pem

# Server Configuration
NODE_ENV=development
PORT=3000
```

## Available Tools

### 1. `payware_generate_code_example`
Generate production-ready code examples for payware API integration.

**Parameters:**
- `operation`: API operation (create_transaction, get_product, etc.)
- `language`: Programming language (python, nodejs, php, java, csharp, curl)
- `partner_type`: Partner type (merchant, isv, payment_institution)
- `include_comments`: Include detailed comments (default: true)
- `include_error_handling`: Include error handling (default: true)

**Example:**
```javascript
payware_generate_code_example({
  operation: "create_transaction",
  language: "python",
  partner_type: "merchant"
})
```

### 2. `payware_generate_documentation`
Generate comprehensive integration documentation.

**Parameters:**
- `language`: Programming language focus
- `partner_type`: Partner type for documentation scope

**Example:**
```javascript
payware_generate_documentation({
  language: "nodejs",
  partner_type: "merchant"
})
```

## Supported Features

- **18+ Operations**: Complete API coverage
- **6 Languages**: python, nodejs, php, java, csharp, curl
- **3 Partner Types**: merchant, isv, payment_institution
- **JWT Authentication**: RS256 with content MD5
- **Error Handling**: Comprehensive try/catch patterns
- **Production Ready**: Immediately usable code

## Troubleshooting

### Common Issues

1. **"Command not found: node"**
   - Ensure Node.js is installed and in PATH
   - Update `command` in config to full path: `/usr/bin/node`

2. **"Cannot find module"**
   - Run `npm install` in the payware MCP directory
   - Check that `cwd` path is correct in configuration

3. **"Server not responding"**
   - Verify the server starts without errors
   - Check that port 3000 (or configured port) is available
   - Review server logs for error messages

### Verification Steps

1. **Manual Server Test**
   ```bash
   cd /path/to/payware/mcp
   node src/index.js
   # Should start without errors
   ```

2. **MCP Protocol Test**
   ```bash
   # Test MCP communication (if tools available)
   echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}' | node src/index.js
   ```

3. **Claude Code Integration Test**
   - Add server to Claude Code settings
   - Open new conversation
   - Try: `payware_generate_code_example({operation: "authentication", language: "python"})`

## Support

For issues with MCP server configuration or integration:

1. Check server logs for error messages
2. Verify Node.js and npm versions
3. Ensure all dependencies are installed
4. Test with simple configuration first
5. Review Claude Code MCP documentation

## Security Notes

- Store private keys securely outside the repository
- Use environment variables for sensitive configuration
- Test with sandbox environment before production
- Regularly rotate API credentials and private keys

---

**Version**: 1.0.0
**Last Updated**: 2024-01-20
**Compatible with**: Claude Code, MCP Protocol v1.0