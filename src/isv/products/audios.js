import {
  registerAudio,
  getProductAudios,
  getAudio,
  updateAudio,
  deleteAudio
} from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

// Common ISV authentication properties
const ISV_AUTH_PROPS = {
  merchantPartnerId: {
    type: "string",
    description: "Target merchant partner ID (8 alphanumeric characters, e.g., 'PZAYNMVE')"
  },
  oauth2Token: {
    type: "string",
    description: "OAuth2 access token obtained from the merchant"
  }
};

// Common ISV validation and credential setup
function validateISVAuth(args) {
  const { merchantPartnerId, oauth2Token } = args;

  if (!merchantPartnerId) {
    throw new Error("Merchant Partner ID is required for ISV operations");
  }

  if (!oauth2Token) {
    throw new Error("OAuth2 token is required for ISV operations");
  }

  const isvPartnerId = getPartnerIdSafe();
  const privateKey = getPrivateKeySafe();

  if (!isvPartnerId || !privateKey) {
    throw new Error("ISV credentials are required");
  }

  return { isvPartnerId, privateKey, merchantPartnerId, oauth2Token };
}

/**
 * Register audio tool implementation for ISVs
 */
export const registerAudioTool = {
  name: "payware_products_register_audio",
  description: `Register an audio file (soundbite) for a merchant's product (ISV operation).

**Supported formats:** Most audio/video formats (up to 200MB)
**Note:** For video files, only the audio channel is registered`,

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      audioPath: {
        type: "string",
        description: "Path to the audio file to upload (e.g., '/path/to/audio.mp3')"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId", "audioPath"]
  },

  async handler(args) {
    const { productId, audioPath, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    if (!productId || !audioPath) {
      throw new Error("Product ID and audio file path are required");
    }

    try {
      const result = await registerAudio({
        productId,
        audioPath,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const audio = result.data;

      return {
        content: [{
          type: "text",
          text: `🎵 **Audio Registered Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Audio Details:**
- ID: ${audio.id}
- Product ID: ${audio.productId}
- Title: ${audio.title}
- Status: ${audio.status === '1' ? '✅ Ready' : '⏳ Processing'}
- Duration: ${audio.duration} seconds
- Uploaded: ${audio.uploadedAt}

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...

**Important Notes:**
${audio.status === '0' ? '⏳ Audio is being processed. Check status with `payware_products_get_audio`' : ''}
${audio.status === '1' ? '✅ Audio is ready for use in soundbite transactions' : ''}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Audio Registration Failed**

**Error:** ${error.message}
**Product ID:** ${productId}
**Audio Path:** ${audioPath}
**ISV -> Merchant:** ${isvPartnerId} -> ${merchantPartnerId}`
        }]
      };
    }
  }
};

/**
 * Get product audios tool implementation for ISVs
 */
export const getAudiosTool = {
  name: "payware_products_get_audios",
  description: "Get all registered audio files for a merchant's product (ISV operation)",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId"]
  },

  async handler(args) {
    const { productId, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    try {
      const result = await getProductAudios({
        productId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
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
          text: `🎵 **Product Audio Files (ISV -> Merchant: ${merchantPartnerId})**

**Product ID:** ${productId}
**Total Audio Files:** ${audioCount}

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}

**Audio Files:**
${audiosList}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Audio Files**

**Error:** ${error.message}
**Product ID:** ${productId}`
        }]
      };
    }
  }
};

/**
 * Get audio tool implementation for ISVs
 */
export const getAudioTool = {
  name: "payware_products_get_audio",
  description: "Get detailed information about a specific audio file (ISV operation)",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      audioId: {
        type: "number",
        description: "Audio identifier"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId", "audioId"]
  },

  async handler(args) {
    const { productId, audioId, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    try {
      const result = await getAudio({
        productId,
        audioId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const audio = result.data;

      return {
        content: [{
          type: "text",
          text: `🎵 **Audio Details (ISV -> Merchant: ${merchantPartnerId})**

**Audio Information:**
- ID: ${audio.id}
- Product ID: ${audio.productId}
- Title: ${audio.title}
- Status: ${audio.status === '1' ? '✅ Ready for use' : '⏳ Processing'}
- Duration: ${audio.duration} seconds
- Uploaded: ${audio.uploadedAt}

**Status Information:**
${audio.status === '0' ? '⏳ **Processing:** Audio is being processed and will be available soon' : ''}
${audio.status === '1' ? '✅ **Ready:** Audio is processed and ready for soundbite transactions' : ''}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Audio**

**Error:** ${error.message}
**Product ID:** ${productId}
**Audio ID:** ${audioId}`
        }]
      };
    }
  }
};

/**
 * Update audio tool implementation for ISVs
 */
export const updateAudioTool = {
  name: "payware_products_update_audio",
  description: "Update audio information (title) or reassign audio to another product (ISV operation)",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
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
        description: "New product ID to reassign audio to (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId", "audioId"]
  },

  async handler(args) {
    const { productId, audioId, title, newProductId, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    if (!title && !newProductId) {
      throw new Error("Either title or newProductId must be provided to update");
    }

    try {
      const result = await updateAudio({
        productId,
        audioId,
        title,
        newProductId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const audio = result.data;

      return {
        content: [{
          type: "text",
          text: `✅ **Audio Updated Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Updated Audio:**
- ID: ${audio.id}
- Product ID: ${audio.productId}${newProductId ? ` (reassigned from ${productId})` : ''}
- Title: ${audio.title}
- Status: ${audio.status === '1' ? '✅ Ready' : '⏳ Processing'}
- Duration: ${audio.duration} seconds

**Changes Made:**
${title ? `- Title updated to: "${title}"` : ''}
${newProductId ? `- Reassigned from product ${productId} to ${newProductId}` : ''}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Audio Update Failed**

**Error:** ${error.message}
**Product ID:** ${productId}
**Audio ID:** ${audioId}`
        }]
      };
    }
  }
};

/**
 * Delete audio tool implementation for ISVs
 */
export const deleteAudioTool = {
  name: "payware_products_delete_audio",
  description: "Delete an audio file from a merchant's product (ISV operation). This action cannot be undone.",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      audioId: {
        type: "number",
        description: "Audio identifier"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId", "audioId"]
  },

  async handler(args) {
    const { productId, audioId, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    try {
      const result = await deleteAudio({
        productId,
        audioId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      return {
        content: [{
          type: "text",
          text: `🗑️ **Audio Deleted Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Deleted Audio:**
- Product ID: ${productId}
- Audio ID: ${audioId}

**Important Notes:**
⚠️ This action cannot be undone
⚠️ Any soundbite transactions using this audio may be affected`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Audio Deletion Failed**

**Error:** ${error.message}
**Product ID:** ${productId}
**Audio ID:** ${audioId}`
        }]
      };
    }
  }
};