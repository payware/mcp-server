# Partner Integration Guide: Using payware MCP Server

*A step-by-step guide for partners to integrate with the payware API using the MCP server*

---

## 🚀 Overview

This guide walks you through integrating with the payware API using our MCP (Model Context Protocol) server. The MCP server acts as your **integration companion** - helping you understand, test, and implement the payware API quickly and correctly.

**What you'll achieve:**
- Understand the payware API through hands-on experimentation
- Generate working code examples in 8+ languages with framework support
- Validate your implementation against a reference
- Reduce integration time from days to hours

---

## 📋 Prerequisites

- Node.js 18+ installed
- Access to payware sandbox environment
- Basic understanding of REST APIs and JWT authentication

---

## 🎯 Partner Integration Journey

### **Step 1: Initial Setup & Understanding** *(First 30 Minutes)*

#### Get the MCP Server Running

```bash
# 1. Get the payware MCP server
cd payware-mcp
npm install

# 2. Set up your credentials
cp .env.example .env

# 3. Edit .env with your sandbox credentials
# PAYWARE_PARTNER_ID=your_partner_id_here
# PAYWARE_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
```

**💡 Environment Variables**: Once set, these are automatically used as defaults in MCP Inspector, so you don't need to provide `partnerId` and `privateKey` parameters for each tool call.

#### Start Exploring with MCP Inspector

Since MCP Inspector has internet connectivity limitations, we use a proxy server to enable API calls:

```bash
# Terminal 1: Start the HTTP proxy server
npm run proxy

# Terminal 2: Start MCP Inspector (in a new terminal)
npm run inspector
```

This setup:
- **Proxy Server** (`npm run proxy`): Runs on `http://localhost:3001` and provides HTTP access to MCP tools
- **MCP Inspector** (`npm run inspector`): Opens at `http://localhost:6274` with full API connectivity

You can now:
- See all available payware tools
- Test API calls interactively (they work through the proxy)
- Get immediate feedback from real payware sandbox API

#### First Steps in MCP Inspector

1. **Browse available tools** - Get an overview of what you can do
2. **Start with key generation** - Use `payware_auth_generate_rsa_keys`
3. **Save your private key** - Store it securely for subsequent steps

**💡 What you learn:** The scope of payware API capabilities and basic setup requirements.

---

### **Step 2: Authentication Testing** *(Next 30 Minutes)*

#### Test JWT Creation

Use the `payware_auth_create_jwt_token` tool with:

```json
{
  "partnerId": "your-partner-id", 
  "privateKey": "your-private-key",
  "requestBody": {
    "trData": {
      "amount": "10.00",
      "currency": "EUR",
      "reasonL1": "Test"
    }
  }
}
```

**What you see:**
- The complete JWT token structure
- How contentMd5 is calculated and included
- Proper RS256 signature format
- Required headers for API calls

#### Key Authentication Insights

- **JWT Structure**: Contains `iss` (your partner ID), `aud` (https://payware.eu), `iat` (timestamp)
- **Content MD5**: Automatically calculated for requests with body (POST/PATCH)
- **Headers**: `Authorization: Bearer <token>`, `Api-Version: 1`, `Content-Type: application/json`

**💡 What you learn:** Exactly how payware authentication works and what a valid request looks like.

---

### **Step 3: Your First Transaction** *(Next 15 Minutes)*

#### Create a Simple Transaction

Use `payware_transactions_create_transaction`:

```json
{
  "partnerId": "your-partner-id",
  "privateKey": "your-private-key", 
  "amount": 10.00,
  "currency": "EUR",
  "reasonL1": "Test payment",
  "type": "PLAIN"
}
```

#### Understanding the Response

```json
{
  "transactionId": "pw123abc456",
  "imageData": null
}
```

**💡 What you learn:** 
- Required vs optional fields
- How flat MCP parameters map to nested API structure
- What a successful response contains
- The transaction ID format (starts with "pw")

---

### **Step 4: Understand API Structure Mapping** *(Next 30 Minutes)*

#### Experiment with Different Transaction Types

**Try a QR Transaction:**
```json
{
  "type": "QR",
  "qrFormat": "PNG", 
  "qrErrorCorrection": "HIGH",
  "qrScale": 16,
  "qrBorder": 4,
  // ... other standard params
}
```

**Try a Barcode Transaction:**
```json
{
  "type": "BARCODE",
  "barFormat": "SVG",
  "barModuleWidth": 3,
  "barBarHeight": 120
  // ... other standard params  
}
```

#### Learn the API Structure

The MCP tool descriptions show you exactly how parameters map:

```json
// What you send to MCP (flat parameters)
{
  "amount": 25.50,
  "currency": "EUR", 
  "reasonL1": "Payment",
  "type": "QR",
  "qrFormat": "PNG"
}

// What actually gets sent to payware API (nested structure)
{
  "trData": {
    "amount": "25.50",
    "currency": "EUR",
    "reasonL1": "Payment"
  },
  "trOptions": {
    "type": "QR"
  },
  "qrOptions": {
    "qrFormat": "PNG"
  }
}
```

**💡 What you learn:** The complete API structure and how different parameters are organized.

---

### **Step 5: Build Your Integration** *(Next 1-2 Hours)*

#### Generate Code Examples

Use the advanced code generation tools:

```json
{
  "language": "python",  // or "nodejs"
  "type": "complete_flow",
  "partnerId": "your-partner-id",
  "amount": 25.00,
  "transactionType": "QR"
}
```

**You get working code like:**

```python
import jwt
import requests
import hashlib
import base64
import json
from datetime import datetime

def create_jwt_token(partner_id, private_key, request_body=None):
    # Complete working JWT implementation
    # ...

def create_transaction(amount, currency, reason):
    # Complete working transaction creation
    # ...

# Ready-to-use example
if __name__ == "__main__":
    transaction = create_transaction(25.00, "EUR", "Test payment")
    print(f"Created transaction: {transaction['transactionId']}")
```

#### Integration Approach

1. **Copy the generated code** into your project
2. **Adapt it to your framework** (Django, Express, etc.)
3. **Test your implementation** by comparing results with MCP
4. **Iterate and refine** based on your specific needs

**💡 What you learn:** Working implementation patterns and how to structure your code.

---

### **Step 6: Test Transaction Lifecycle** *(Next 30 Minutes)*

#### Complete Transaction Flow

```json
// 1. Create transaction
{
  "tool": "payware_transactions_create_transaction",
  "amount": 15.00,
  "reasonL1": "Order #12345"
}
// Returns: { "transactionId": "pw123..." }

// 2. Get status  
{
  "tool": "payware_transactions_get_transaction_status",
  "transactionId": "pw123..."
}

// 3. Cancel if needed
{
  "tool": "payware_transactions_cancel_transaction", 
  "transactionId": "pw123...",
  "statusMessage": "Customer cancelled order"
}
```

#### Test Callback Handling

Use `payware_transactions_simulate_callback`:

```json
{
  "transactionId": "pw123...",
  "status": "CONFIRMED",
  "callbackUrl": "https://your-server.com/payware-callback",
  "amount": 15.00
}
```

**What you learn:**
- Callback payload structure
- Different status types (CONFIRMED, DECLINED, FAILED)
- How to handle transaction state changes

**💡 What you learn:** Complete transaction lifecycle and callback handling.

---

### **Step 7: Production Readiness** *(Final 1-2 Hours)*

#### Validation Checklist

Use MCP to validate each aspect of your implementation:

**✅ Authentication**
- [ ] Your JWT tokens match MCP-generated tokens
- [ ] Your MD5 calculations are identical to MCP
- [ ] Your request headers are correct

**✅ Transaction Creation**
- [ ] Your request bodies match MCP request bodies exactly
- [ ] Your parameter mapping is correct
- [ ] Your error handling covers all scenarios

**✅ Response Handling** 
- [ ] You parse responses correctly
- [ ] You handle all transaction states
- [ ] Your callback endpoint works with simulated callbacks

#### Production Deployment

1. **Switch credentials** from sandbox to production
2. **Test with small amounts** first
3. **Monitor logs** for any discrepancies
4. **Use MCP for troubleshooting** if issues arise

**💡 What you learn:** How to validate your implementation and deploy confidently.

---

## 📋 Integration Checklist

Use this checklist to track your integration progress:

### ✅ **Setup & Authentication**
- [ ] MCP server installed and running
- [ ] RSA key pair generated (use `payware_auth_generate_rsa_keys`)
- [ ] Public key registered with payware
- [ ] JWT creation tested (use `payware_auth_create_jwt_token`)
- [ ] JWT structure verified and understood

### ✅ **Basic Transactions**  
- [ ] First PLAIN transaction created (use MCP)
- [ ] Transaction status checked (use MCP)
- [ ] Transaction cancelled (use MCP)
- [ ] Response structure understood

### ✅ **Advanced Features**
- [ ] QR transaction created and tested
- [ ] Barcode transaction created and tested  
- [ ] Different amounts and currencies tested
- [ ] Optional parameters experimented with
- [ ] Error scenarios tested

### ✅ **Code Implementation**
- [ ] Code example generated (use `payware_generate_code_example` with your preferred language and framework)
- [ ] Code adapted to your system
- [ ] Implementation tested against sandbox
- [ ] Results compared with MCP outputs
- [ ] Error handling implemented

### ✅ **Callback Handling**
- [ ] Callback structure understood (use simulator)
- [ ] Callback endpoint implemented
- [ ] Different statuses handled (CONFIRMED, DECLINED, FAILED)
- [ ] Callback validation implemented

### ✅ **Production Ready**
- [ ] Complete flows tested end-to-end
- [ ] Edge cases handled
- [ ] Monitoring and logging implemented
- [ ] Production credentials configured
- [ ] Go-live testing completed

---

## 🎓 Real-World Example: E-commerce QR Payments

### Scenario
*"I need to add QR code payments to my e-commerce checkout"*

### Implementation Timeline

**Hour 1 (30 minutes):**
```bash
# 1. Setup
npm install
cp .env.example .env
# Edit .env with your credentials

# 2. Understanding (start both proxy and inspector)
npm run proxy     # Terminal 1
npm run inspector # Terminal 2
# Test payware_auth_generate_rsa_keys
# Test payware_transactions_create_transaction with type: "QR"
```

**Hour 2 (1 hour):**
```bash
# 3. Code Generation
# Use payware_generate_code_example with comprehensive options
# Language: "nodejs", Type: "complete_flow"
# Copy generated code to your Express.js app
```

```javascript
// Your checkout endpoint
app.post('/checkout', async (req, res) => {
  const { amount, orderId, currency } = req.body;
  
  // Use the generated payware code
  const transaction = await createPaywareTransaction({
    amount: amount,
    currency: currency,
    reasonL1: `Order ${orderId}`,
    type: 'QR',
    qrFormat: 'PNG',
    callbackUrl: 'https://mystore.com/payware-callback'
  });
  
  res.json({ 
    transactionId: transaction.transactionId,
    qrCode: transaction.imageData  // Base64 PNG
  });
});
```

**Hour 3 (1 hour):**
```javascript
// Callback handler
app.post('/payware-callback', (req, res) => {
  const { transactionId, status, amount } = req.body;
  
  if (status === 'CONFIRMED') {
    // Mark order as paid
    updateOrderStatus(transactionId, 'PAID');
  } else if (status === 'DECLINED') {
    // Handle declined payment
    updateOrderStatus(transactionId, 'DECLINED');
  }
  
  res.status(200).send('OK');
});

// Test with MCP callback simulator first!
```

**Hour 4 (final 30 minutes):**
- Test complete flows with real QR codes
- Deploy to staging
- Test with production credentials
- Go live! 🚀

---

## 💡 Best Practices & Tips

### Use MCP as Your Reference Implementation

**Before writing code:**
- Test your understanding with MCP first
- Experiment with different parameter combinations
- Understand error responses

**During development:**
- Generate comprehensive code examples with framework support (Django, Express, Laravel, Spring Boot, etc.)
- Compare your requests with MCP requests
- Use MCP for debugging when things go wrong

**After implementation:**
- Validate your results against MCP results  
- Use MCP for regression testing
- Keep MCP handy for troubleshooting

### Common Pitfalls to Avoid

**❌ Don't:**
- Skip the experimentation phase - jumping straight to coding
- Ignore the API structure mapping shown in MCP descriptions
- Forget to test callback handling thoroughly
- Mix up sandbox and production credentials

**✅ Do:**
- Use MCP Inspector for initial exploration
- Follow the step-by-step approach in this guide
- Test each component individually before integration
- Keep MCP running for ongoing validation

### Debugging with MCP

When something goes wrong:

1. **Create the same request in MCP** - Does it work there?
2. **Compare request bodies** - Are they identical?
3. **Check JWT tokens** - Do they match?
4. **Verify credentials** - Are you using the right keys?
5. **Test simpler scenarios** - Start with basic PLAIN transactions

---

## 🎯 Next Steps

### After Successful Integration

1. **Explore advanced features:**
   - Transaction processing (for merchant scenarios)
   - Transaction history API
   - Different callback scenarios

2. **Optimize your implementation:**
   - Add proper error handling
   - Implement retry logic
   - Add monitoring and alerts

3. **Scale your integration:**
   - Add more transaction types
   - Implement bulk operations
   - Add reporting and analytics

### Support & Resources

- **Documentation**: Complete API reference documentation
- **MCP Server**: Interactive testing and code generation
- **Support Team**: For complex integration scenarios
- **Community**: Partner developer forums and resources

---

## 📞 Need Help?

If you get stuck at any step:

1. **Check the MCP tool descriptions** - They contain detailed API mapping
2. **Use MCP Inspector** - Test your understanding interactively  
3. **Compare with generated code** - Use the advanced code generation tools for framework-specific examples
4. **Contact payware support** - We're here to help!

---

*Happy integrating! The MCP server is your companion throughout the journey - from first API call to production deployment.* 🚀