# Private Keys Setup

This directory contains RSA private keys for payware API authentication. Private keys are required for JWT token generation and API requests.

## Security Notice

⚠️ **IMPORTANT**: Private keys contain sensitive credentials and should never be committed to version control or shared publicly.

- All `.pem` files in this directory are excluded via `.gitignore`
- Never share private keys via email, chat, or public repositories
- Store keys securely with appropriate file permissions (600)

## Key Files

### Required Keys

Depending on your partner type and environment, you'll need one or more of these keys:

- **Production Keys**: For live API integration
  - `production-payware-merchant-private-key.pem` - Merchant production key
  - `production-payware-isv-private-key.pem` - ISV production key
  - `production-payware-pi-private-key.pem` - Payment Institution production key

- **Sandbox Keys**: For testing and development
  - `sandbox-payware-merchant-private-key.pem` - Merchant sandbox key
  - `sandbox-payware-isv-private-key.pem` - ISV sandbox key
  - `sandbox-payware-pi-private-key.pem` - Payment Institution sandbox key

## Generating Keys

### Using payware MCP Tools

The easiest way to generate keys is using the built-in MCP tool:

```bash
# Generate RSA key pair (2048-bit by default)
# Use the payware_authentication_generate_rsa_keys tool
```

This will generate both private and public keys. **Register the public key** with payware via your partner portal before using the private key.

### Manual Generation

You can also generate keys manually using OpenSSL:

```bash
# Generate private key
openssl genrsa -out sandbox-payware-merchant-private-key.pem 2048

# Extract public key (for registration with payware)
openssl rsa -in sandbox-payware-merchant-private-key.pem -pubout -out public-key.pem

# Set secure permissions
chmod 600 sandbox-payware-merchant-private-key.pem
```

## Environment Configuration

Update your `.env` file to reference the correct key files:

```env
# Sandbox keys
PAYWARE_SANDBOX_PRIVATE_KEY_PATH=keys/sandbox-payware-merchant-private-key.pem

# Production keys
PAYWARE_PRODUCTION_PRIVATE_KEY_PATH=keys/production-payware-merchant-private-key.pem
```

## Key Registration

**CRITICAL**: After generating keys, you must register the **public key** with payware:

1. Extract the public key from your private key
2. Log into your payware partner portal
3. Navigate to API Settings > Keys
4. Upload or paste your public key
5. Save the configuration

The MCP server will fail with authentication errors if the public key isn't properly registered.

## Validation

Use the key validation utility to test your setup:

```bash
node check-keys.js
```

This will verify that your keys are properly formatted and can generate valid JWT tokens.

## File Permissions

Ensure private keys have restrictive permissions:

```bash
# Set secure permissions for all key files
chmod 600 keys/*.pem
```

## Troubleshooting

### Authentication Failed (ERR_INVALID_SIGNATURE)
- **Cause**: Public key registered with payware doesn't match your private key
- **Solution**: Re-extract public key from private key and re-register with payware

### File Not Found
- **Cause**: Key path in `.env` doesn't match actual file location
- **Solution**: Verify file paths in environment configuration

### Permission Denied
- **Cause**: Key file permissions too restrictive or too open
- **Solution**: Set permissions to 600 (`chmod 600 filename.pem`)