import axios from 'axios';
import FormData from 'form-data';
import { createJWTToken } from '../../core/auth/jwt-token.js';
import { getSandboxUrl, getProductionUrl, getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { readFileSync } from 'fs';

/**
 * Get transaction information using Soundbite file via payware API
 * @param {Object} params - Soundbite transaction parameters
 * @returns {Object} Transaction response
 */
export async function getSoundbiteTransaction({
  filePath,
  partnerId,
  privateKey,
  useSandbox = true
}) {
  if (!filePath) {
    throw new Error('filePath is required for soundbite transaction');
  }

  if (!partnerId || !privateKey) {
    throw new Error('Partner ID and private key are required for proper JWT creation');
  }

  let fileBuffer;
  try {
    fileBuffer = readFileSync(filePath);
  } catch (error) {
    throw new Error(`Failed to read soundbite file: ${error.message}`);
  }

  // Create form data
  const formData = new FormData();
  formData.append('file', fileBuffer, {
    filename: filePath.split('/').pop() || 'soundbite.lo',
    contentType: 'application/octet-stream'
  });

  // For multipart/form-data requests, we don't calculate contentMd5 the same way
  // The JWT token is created without content MD5 for multipart uploads
  const tokenData = createJWTToken(partnerId, privateKey, null);

  // Required headers as per payware API documentation
  const headers = {
    'Authorization': `Bearer ${tokenData.token}`,
    'Api-Version': '1',  // Required: current API version
    ...formData.getHeaders()
  };

  try {
    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();
    const response = await axios.post(`${baseUrl}/transactions`, formData, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return {
      success: true,
      transaction: response.data,
      requestId: response.headers['x-request-id'],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        code: error.response?.data?.code,
        details: error.response?.data
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Soundbite transaction tool implementation
 */
export const soundbiteTransactionTool = {
  name: "payware_operations_soundbite_transaction",
  description: `Get transaction information using a Soundbite SDK output file. This allows payment institutions to process transactions using audio-based identifiers.

**Soundbite Integration:**
- Upload Soundbite SDK output file (.lo extension)
- File contains audio-encoded transaction identifier
- Alternative to QR/barcode scanning for accessibility
- Returns same transaction information as regular transaction lookup

**File Requirements:**
- File must be output from Soundbite SDK
- Supported file format: .lo (Soundbite format)
- File must contain valid transaction identifier
- Maximum file size limits apply

**API Request:**
- Uses multipart/form-data content type
- File uploaded as form field named 'file'
- JWT authentication without contentMd5 (multipart upload)`,
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Absolute path to the Soundbite SDK output file (typically with .lo extension)"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for JWT token creation. Uses environment-specific private key as default.",
        default: getPrivateKeySafe()
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment for testing",
        default: true
      }
    },
    required: ["filePath"]
  },

  async handler(args) {
    const {
      filePath,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(args.useSandbox ?? true),
      useSandbox = true
    } = args;

    if (!filePath) {
      throw new Error("filePath is required for soundbite transaction");
    }

    if (!partnerId) {
      throw new Error("Partner ID is required. Provide via 'partnerId' parameter or set PAYWARE_PARTNER_ID environment variable.");
    }

    if (!privateKey) {
      throw new Error("Private key is required. Provide via 'privateKey' parameter or set PAYWARE_PRIVATE_KEY environment variable.");
    }

    const result = await getSoundbiteTransaction({
      filePath,
      partnerId,
      privateKey,
      useSandbox
    });

    const baseUrl = useSandbox ? getSandboxUrl() : getProductionUrl();

    if (result.success) {
      const tx = result.transaction;
      const createdDate = tx.created ? new Date(tx.created * 1000).toISOString() : 'N/A';
      const typeDisplay = tx.transactionType || 'DEFAULT';
      const initiatorDisplay = tx.initiatedBy || 'UNKNOWN';

      return {
        content: [{
          type: "text",
          text: `🔊 **Soundbite Transaction Retrieved Successfully**

**Transaction Information:**
- ID: ${tx.transactionId || 'N/A'}
- Type: ${typeDisplay}
- Initiated By: ${initiatorDisplay}
- Status: ⏳ ACTIVE
- Created: ${createdDate}
- Remaining TTL: ${tx.timeToLive || 'N/A'} seconds

**Transaction Details:**
- Amount: ${tx.amount || 'N/A'} ${tx.currency || 'N/A'}
- Reason L1: ${tx.reasonL1 || 'N/A'}
${tx.reasonL2 ? `- Reason L2: ${tx.reasonL2}` : ''}

**Payee Information:**
- Account: ${tx.payeeAccount || 'N/A'}
- Friendly Name: ${tx.payeeFriendlyName || 'N/A'}
- BIC: ${tx.payeeBIC || 'N/A'}

**Payer Information:**
- Account: ${tx.payerAccount || 'N/A'}
- Friendly Name: ${tx.payerFriendlyName || 'N/A'}
- BIC: ${tx.payerBIC || 'N/A'}

**Soundbite Details:**
- File Path: ${filePath}
- File Name: ${filePath.split('/').pop()}
- Processing Method: Audio-based transaction identifier

**Full API Response:**
\`\`\`json
${JSON.stringify(result.transaction, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: POST ${baseUrl}/transactions (multipart/form-data)
- Request ID: ${result.requestId || 'N/A'}
- Timestamp: ${result.timestamp}

**Next Steps:**
1. Transaction successfully identified from soundbite file
2. Use transaction ID: \`${tx.transactionId || 'N/A'}\` for further operations
3. ${!tx.payerAccount ? 'Process this transaction if you are the payer' : 'Transaction ready for finalization'}
4. Use \`payware_pi_process_transaction\` to process payment
5. Use \`payware_pi_finalize_transaction\` to confirm/decline

**♿ Accessibility Note:**
- Soundbite provides audio-based alternative to QR/barcode scanning
- Enables accessible payment processing for visually impaired users
- Same functionality as visual transaction identifiers`
        }]
      };
    } else {
      return {
        content: [{
          type: "text",
          text: `❌ **Soundbite Transaction Processing Failed**

**File Path:** ${filePath}

**Error Details:**
- Message: ${result.error.message}
- Status: ${result.error.status || 'N/A'}
- Code: ${result.error.code || 'N/A'}

**Full Error Response:**
\`\`\`json
${JSON.stringify(result.error.details || result.error, null, 2)}
\`\`\`

**Timestamp:** ${result.timestamp}

**Common Soundbite Issues:**
1. **File Not Found**: Verify the file path is correct and accessible
2. **Invalid File Format**: Ensure file is a valid Soundbite SDK output (.lo format)
3. **Corrupted Audio Data**: File may be corrupted or invalid
4. **Transaction Not Found**: Audio may not contain valid transaction identifier
5. **File Size Limits**: File may exceed maximum upload size
6. **Authentication Issues**: Verify JWT token and partner credentials

**Troubleshooting:**
1. **File Path**: Ensure file path is absolute and file exists
2. **File Format**: Verify file is output from Soundbite SDK (usually .lo extension)
3. **File Integrity**: Check file is not corrupted or modified
4. **Audio Quality**: Ensure soundbite was captured with sufficient quality
5. **Transaction Validity**: Verify the original transaction hasn't expired
6. **Permissions**: Check file read permissions

**File Requirements:**
- ✅ Valid Soundbite SDK output file
- ✅ Readable file permissions
- ✅ File size within limits
- ✅ Contains valid transaction identifier
- ✅ Transaction still active/valid

**Alternative Actions:**
- Try capturing soundbite again if audio quality was poor
- Use QR/barcode scanning as alternative
- Verify original transaction is still active
- Check Soundbite SDK integration and file generation`
        }]
      };
    }
  }
};