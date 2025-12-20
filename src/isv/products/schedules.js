import {
  createPriceSchedule,
  getProductSchedules,
  getSchedule,
  updatePriceSchedule,
  deletePriceSchedule
} from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { PRICE_CORRECTION_TYPES, CORRECTION_TYPES } from '../../shared/products/products-api.js';

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
 * Create price schedule tool implementation for ISVs
 */
export const createScheduleTool = {
  name: "payware_products_create_schedule",
  description: "Create a price schedule for a merchant's product (ISV operation)",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      description: {
        type: "string",
        description: "Schedule description",
        maxLength: 300
      },
      priceCorrection: {
        type: "string",
        enum: Object.values(PRICE_CORRECTION_TYPES),
        description: "Price correction direction",
        default: PRICE_CORRECTION_TYPES.DISCOUNT
      },
      correctionType: {
        type: "string",
        enum: Object.values(CORRECTION_TYPES),
        description: "Price correction method",
        default: CORRECTION_TYPES.PERCENTAGE
      },
      correctionValue: {
        type: "string",
        description: "Correction value (positive number with max 2 decimals)",
        default: "0.00"
      },
      dateFrom: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Schedule start date (YYYY-MM-DD format)"
      },
      dateTo: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Schedule end date (YYYY-MM-DD format)"
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
    const { productId, description, priceCorrection, correctionType, correctionValue, dateFrom, dateTo, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    if (!productId) {
      throw new Error("Product ID is required");
    }

    try {
      const result = await createPriceSchedule({
        productId,
        description,
        priceCorrection,
        correctionType,
        correctionValue,
        dateFrom,
        dateTo,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const schedule = result.data;

      return {
        content: [{
          type: "text",
          text: `📅 **Price Schedule Created Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Schedule Details:**
- ID: ${schedule.id}
- Product ID: ${schedule.productId}
- Description: ${schedule.description || 'No description'}
- Type: ${schedule.priceCorrection} (${schedule.correctionType})
- Value: ${schedule.correctionValue}${schedule.correctionType === 'PERCENTAGE' ? '%' : ''}

**Pricing:**
- Regular Price: ${schedule.regularPrice}
- Sale Price: ${schedule.salePrice}

**Active Period:**
- From: ${schedule.dateFrom}
- To: ${schedule.dateTo}

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}
- OAuth2 Token: ${oauth2Token.substring(0, 8)}...`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Schedule Creation Failed**

**Error:** ${error.message}
**Product ID:** ${productId}
**ISV -> Merchant:** ${isvPartnerId} -> ${merchantPartnerId}`
        }]
      };
    }
  }
};

/**
 * Get product schedules tool implementation for ISVs
 */
export const getSchedulesTool = {
  name: "payware_products_get_schedules",
  description: "Get all price schedules for a merchant's product (ISV operation)",

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
      const result = await getProductSchedules({
        productId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const schedules = result.data;
      const scheduleCount = Array.isArray(schedules) ? schedules.length : 0;

      let schedulesList = '';
      if (Array.isArray(schedules) && schedules.length > 0) {
        schedulesList = schedules.map(schedule =>
          `**Schedule ${schedule.id}:**
- Description: ${schedule.description || 'No description'}
- Type: ${schedule.priceCorrection} ${schedule.correctionValue}${schedule.correctionType === 'PERCENTAGE' ? '%' : ''}
- Period: ${schedule.dateFrom} to ${schedule.dateTo}
- Sale Price: ${schedule.salePrice}`
        ).join('\n\n');
      } else {
        schedulesList = 'No price schedules found for this product.';
      }

      return {
        content: [{
          type: "text",
          text: `📅 **Product Price Schedules (ISV -> Merchant: ${merchantPartnerId})**

**Product ID:** ${productId}
**Total Schedules:** ${scheduleCount}

**ISV Integration Details:**
- ISV Partner: ${isvPartnerId}
- Target Merchant: ${merchantPartnerId}

**Schedules:**
${schedulesList}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Schedules**

**Error:** ${error.message}
**Product ID:** ${productId}`
        }]
      };
    }
  }
};

/**
 * Get specific schedule tool implementation for ISVs
 */
export const getScheduleTool = {
  name: "payware_products_get_schedule",
  description: "Get detailed information about a specific price schedule (ISV operation)",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      scheduleId: {
        type: "number",
        description: "Schedule identifier"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId", "scheduleId"]
  },

  async handler(args) {
    const { productId, scheduleId, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    try {
      const result = await getSchedule({
        productId,
        scheduleId,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const schedule = result.data;

      return {
        content: [{
          type: "text",
          text: `📅 **Schedule Details (ISV -> Merchant: ${merchantPartnerId})**

**Schedule Information:**
- ID: ${schedule.id}
- Product ID: ${schedule.productId}
- Description: ${schedule.description || 'No description'}

**Price Configuration:**
- Type: ${schedule.priceCorrection} (${schedule.correctionType})
- Value: ${schedule.correctionValue}${schedule.correctionType === 'PERCENTAGE' ? '%' : ''}
- Regular Price: ${schedule.regularPrice}
- Sale Price: ${schedule.salePrice}

**Active Period:**
- From: ${schedule.dateFrom}
- To: ${schedule.dateTo}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Schedule**

**Error:** ${error.message}
**Product ID:** ${productId}
**Schedule ID:** ${scheduleId}`
        }]
      };
    }
  }
};

/**
 * Update schedule tool implementation for ISVs
 */
export const updateScheduleTool = {
  name: "payware_products_update_schedule",
  description: "Update an existing price schedule (ISV operation)",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      scheduleId: {
        type: "number",
        description: "Schedule identifier"
      },
      description: {
        type: "string",
        description: "Schedule description",
        maxLength: 300
      },
      priceCorrection: {
        type: "string",
        enum: Object.values(PRICE_CORRECTION_TYPES),
        description: "Price correction direction"
      },
      correctionType: {
        type: "string",
        enum: Object.values(CORRECTION_TYPES),
        description: "Price correction method"
      },
      correctionValue: {
        type: "string",
        description: "Correction value (positive number with max 2 decimals)"
      },
      dateFrom: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Schedule start date (YYYY-MM-DD format)"
      },
      dateTo: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Schedule end date (YYYY-MM-DD format)"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId", "scheduleId"]
  },

  async handler(args) {
    const { productId, scheduleId, description, priceCorrection, correctionType, correctionValue, dateFrom, dateTo, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    try {
      const result = await updatePriceSchedule({
        productId,
        scheduleId,
        description,
        priceCorrection,
        correctionType,
        correctionValue,
        dateFrom,
        dateTo,
        partnerType: 'isv',
        isvPartnerId,
        privateKey,
        merchantPartnerId,
        oauth2Token,
        useSandbox
      });

      const schedule = result.data;

      return {
        content: [{
          type: "text",
          text: `✅ **Schedule Updated Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Updated Schedule:**
- ID: ${schedule.id}
- Product ID: ${schedule.productId}
- Description: ${schedule.description || 'No description'}
- Type: ${schedule.priceCorrection} (${schedule.correctionType})
- Value: ${schedule.correctionValue}${schedule.correctionType === 'PERCENTAGE' ? '%' : ''}
- Sale Price: ${schedule.salePrice}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Schedule Update Failed**

**Error:** ${error.message}
**Product ID:** ${productId}
**Schedule ID:** ${scheduleId}`
        }]
      };
    }
  }
};

/**
 * Delete schedule tool implementation for ISVs
 */
export const deleteScheduleTool = {
  name: "payware_products_delete_schedule",
  description: "Delete a price schedule (ISV operation). This action cannot be undone.",

  inputSchema: {
    type: "object",
    properties: {
      ...ISV_AUTH_PROPS,
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      scheduleId: {
        type: "number",
        description: "Schedule identifier"
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["merchantPartnerId", "oauth2Token", "productId", "scheduleId"]
  },

  async handler(args) {
    const { productId, scheduleId, useSandbox = true } = args;
    const { isvPartnerId, privateKey, merchantPartnerId, oauth2Token } = validateISVAuth(args);

    try {
      const result = await deletePriceSchedule({
        productId,
        scheduleId,
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
          text: `🗑️ **Schedule Deleted Successfully (ISV -> Merchant: ${merchantPartnerId})**

**Deleted Schedule:**
- Product ID: ${productId}
- Schedule ID: ${scheduleId}

**Important Notes:**
⚠️ This action cannot be undone
⚠️ Product pricing may change if this was an active schedule`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Schedule Deletion Failed**

**Error:** ${error.message}
**Product ID:** ${productId}
**Schedule ID:** ${scheduleId}`
        }]
      };
    }
  }
};