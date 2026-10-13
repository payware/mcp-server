import {
  registerAudio,
  getProductAudios,
  getAudio,
  updateAudio,
  deleteAudio
} from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { CHANGES, CREATES, READS } from '../../shared/tool-annotations.js';

/**
 * Register audio tool implementation for merchants
 */
export const registerAudioTool = {
  name: "payware_products_register_audio",
  annotations: CREATES,
  description: `Register an audio file (soundbite) for a product to enable audio-based payment initiation.

**Supported formats:** MP3, WAV, OGG, M4A, FLAC, AAC, WMA, MP4, MOV, up to 100 MB, holding 2 to 120 seconds of audio
**Note:** For video files, only the audio channel is registered`,

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      audioPath: {
        type: "string",
        description: "Path to the audio file to upload (e.g., '/path/to/audio.mp3')"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId", "audioPath"]
  },

  async handler(args) {
    const {
      productId,
      audioPath,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId) {
      throw new Error("Product ID is required");
    }

    if (!audioPath) {
      throw new Error("Audio file path is required");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

    try {
      const result = await registerAudio({
        productId,
        audioPath,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const audio = result.data;

      return {
        content: [{
          type: "text",
          text: `🎵 **Audio Registered Successfully**

**Audio Details:**
- ID: ${audio.id}
- Product ID: ${audio.productId}
- Title: ${audio.title}
- Status: ${audio.status === '1' ? '✅ Ready' : '⏳ Processing'}
- Duration: ${audio.duration} seconds
- Uploaded: ${audio.uploadedAt}

**API Response:**
\`\`\`json
${JSON.stringify(audio, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Important Notes:**
${audio.status === '0' ? '⏳ Audio is being processed. Check status with `payware_products_get_audio`' : ''}
${audio.status === '1' ? '✅ Audio is ready for use in soundbite transactions' : ''}

**Next Steps:**
- Use \`payware_products_get_audios\` to view all product audios
- Use \`payware_products_get_audio\` to check processing status
- Create soundbite transactions using this audio`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Audio Registration Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Audio Path: ${audioPath}

**Troubleshooting:**
1. Verify the audio file path exists and is accessible
2. Check file size (max 100 MB) and length (2 to 120 seconds of audio)
3. Ensure the format is MP3, WAV, OGG, M4A, FLAC, AAC, WMA, MP4 or MOV
4. Verify the product ID exists and belongs to your account
5. Check available storage space`
        }]
      };
    }
  }
};

/**
 * Get product audios tool implementation for merchants
 */
export const getAudiosTool = {
  name: "payware_products_get_audios",
  annotations: READS,
  description: "Get all registered audio files for a product",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId"]
  },

  async handler(args) {
    const {
      productId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId) {
      throw new Error("Product ID is required");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

    try {
      const result = await getProductAudios({
        productId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const audios = result.data;
      const audioCount = Array.isArray(audios) ? audios.length : 0;

      let audiosList = '';
      if (Array.isArray(audios) && audios.length > 0) {
        audiosList = audios.map(audio =>
          `**Audio ${audio.id}:**
- Title: ${audio.title}
- Status: ${audio.status === '1' ? '✅ Ready' : '⏳ Processing'}
- Duration: ${audio.duration} seconds
- Uploaded: ${audio.uploadedAt}`
        ).join('\n\n');
      } else {
        audiosList = 'No audio files found for this product.';
      }

      return {
        content: [{
          type: "text",
          text: `🎵 **Product Audio Files**

**Product ID:** ${productId}
**Total Audio Files:** ${audioCount}

**Audio Files:**
${audiosList}

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Available Actions:**
- \`payware_products_register_audio\` - Upload new audio file
- \`payware_products_get_audio\` - Get specific audio details
- \`payware_products_update_audio\` - Update audio information
- \`payware_products_delete_audio\` - Delete audio file`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Audio Files**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}`
        }]
      };
    }
  }
};

/**
 * Get audio tool implementation for merchants
 */
export const getAudioTool = {
  name: "payware_products_get_audio",
  annotations: READS,
  description: "Get detailed information about a specific audio file",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      audioId: {
        type: "number",
        description: "Audio identifier"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId", "audioId"]
  },

  async handler(args) {
    const {
      productId,
      audioId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId || !audioId) {
      throw new Error("Product ID and audio ID are required");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

    try {
      const result = await getAudio({
        productId,
        audioId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const audio = result.data;

      return {
        content: [{
          type: "text",
          text: `🎵 **Audio Details**

**Audio Information:**
- ID: ${audio.id}
- Product ID: ${audio.productId}
- Title: ${audio.title}
- Status: ${audio.status === '1' ? '✅ Ready for use' : '⏳ Processing'}
- Duration: ${audio.duration} seconds
- Uploaded: ${audio.uploadedAt}

**API Response:**
\`\`\`json
${JSON.stringify(audio, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Status Information:**
${audio.status === '0' ? '⏳ **Processing:** Audio is being processed and will be available soon' : ''}
${audio.status === '1' ? '✅ **Ready:** Audio is processed and ready for soundbite transactions' : ''}

**Available Actions:**
- \`payware_products_update_audio\` - Update audio title or reassign to another product
- \`payware_products_delete_audio\` - Delete this audio file`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Audio**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Audio ID: ${audioId}`
        }]
      };
    }
  }
};

/**
 * Update audio tool implementation for merchants
 */
export const updateAudioTool = {
  name: "payware_products_update_audio",
  annotations: CHANGES,
  description: "Update audio information (title) or reassign audio to another product",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Current product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      audioId: {
        type: "number",
        description: "Audio identifier"
      },
      title: {
        type: "string",
        description: "New audio title",
        maxLength: 150
      },
      newProductId: {
        type: "string",
        description: "Product to move the audio to (starts with 'pr'). Sent as a transfer, which keeps the fingerprint; the target must be in the same shop",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId", "audioId"]
  },

  async handler(args) {
    const {
      productId,
      audioId,
      title,
      newProductId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId || !audioId) {
      throw new Error("Product ID and audio ID are required");
    }

    if (!title && !newProductId) {
      throw new Error("Either title or newProductId must be provided to update");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

    try {
      const result = await updateAudio({
        productId,
        audioId,
        title,
        newProductId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const audio = result.data;

      return {
        content: [{
          type: "text",
          text: `✅ **Audio Updated Successfully**

**Updated Audio:**
- ID: ${audio.id}
- Product ID: ${audio.productId}${newProductId ? ` (reassigned from ${productId})` : ''}
- Title: ${audio.title}
- Status: ${audio.status === '1' ? '✅ Ready' : '⏳ Processing'}
- Duration: ${audio.duration} seconds
- Uploaded: ${audio.uploadedAt}

**Changes Made:**
${title ? `- Title updated to: "${title}"` : ''}
${newProductId ? `- Reassigned from product ${productId} to ${newProductId}` : ''}

**API Response:**
\`\`\`json
${JSON.stringify(audio, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Audio Update Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Audio ID: ${audioId}

**Troubleshooting:**
1. Verify both product IDs exist and belong to your account
2. Check that the audio ID is correct
3. Ensure title length is within limits (150 chars)
4. Verify JWT token is valid and not expired`
        }]
      };
    }
  }
};

/**
 * Delete audio tool implementation for merchants
 */
export const deleteAudioTool = {
  name: "payware_products_delete_audio",
  annotations: CHANGES,
  description: "Delete an audio file from a product. This action cannot be undone.",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      audioId: {
        type: "number",
        description: "Audio identifier"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId", "audioId"]
  },

  async handler(args) {
    const {
      productId,
      audioId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId || !audioId) {
      throw new Error("Product ID and audio ID are required");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

    try {
      const result = await deleteAudio({
        productId,
        audioId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      return {
        content: [{
          type: "text",
          text: `🗑️ **Audio Deleted Successfully**

**Deleted Audio:**
- Product ID: ${productId}
- Audio ID: ${audioId}

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Important Notes:**
⚠️ This action cannot be undone
⚠️ Any soundbite transactions using this audio may be affected

**Next Steps:**
- Use \`payware_products_get_audios\` to view remaining audio files
- Upload new audio files with \`payware_products_register_audio\`
- Check for any active soundbite transactions that used this audio`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Audio Deletion Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Audio ID: ${audioId}

**Troubleshooting:**
1. Verify the audio ID exists and belongs to the specified product
2. Check if the audio is currently being used in active transactions
3. Ensure proper permissions and JWT token validity`
        }]
      };
    }
  }
};