import {
  createPriceSchedule,
  getProductSchedules,
  getSchedule,
  updatePriceSchedule,
  deletePriceSchedule
} from '../../shared/products/products-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { PRICE_CORRECTION_TYPES, CORRECTION_TYPES } from '../../shared/products/products-api.js';

/**
 * Create price schedule tool implementation for merchants
 */
export const createScheduleTool = {
  name: "payware_products_create_schedule",
  description: "Create a price schedule for a product to manage time-based pricing",

  inputSchema: {
    type: "object",
    properties: {
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
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)",
        default: getPrivateKeySafe()
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
      description,
      priceCorrection = PRICE_CORRECTION_TYPES.DISCOUNT,
      correctionType = CORRECTION_TYPES.PERCENTAGE,
      correctionValue = "0.00",
      dateFrom,
      dateTo,
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
      const result = await createPriceSchedule({
        productId,
        description,
        priceCorrection,
        correctionType,
        correctionValue,
        dateFrom,
        dateTo,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const schedule = result.data;

      return {
        content: [{
          type: "text",
          text: `📅 **Price Schedule Created Successfully**

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

**API Response:**
\`\`\`json
${JSON.stringify(schedule, null, 2)}
\`\`\`

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Next Steps:**
- Use \`payware_products_get_schedules\` to view all schedules
- Use \`payware_products_update_schedule\` to modify this schedule
- Monitor product sale price changes during active period`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Schedule Creation Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}

**Troubleshooting:**
1. Verify the product ID exists and belongs to your account
2. Check date format (YYYY-MM-DD) and ensure dateTo > dateFrom
3. Verify correction value is a positive number
4. Ensure JWT token is valid and not expired`
        }]
      };
    }
  }
};

/**
 * Get product schedules tool implementation for merchants
 */
export const getSchedulesTool = {
  name: "payware_products_get_schedules",
  description: "Get all price schedules for a product",

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
        description: "RSA private key for authentication (uses environment-specific private key as default)",
        default: getPrivateKeySafe()
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
      const result = await getProductSchedules({
        productId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
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
          text: `📅 **Product Price Schedules**

**Product ID:** ${productId}
**Total Schedules:** ${scheduleCount}

**Schedules:**
${schedulesList}

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Available Actions:**
- \`payware_products_create_schedule\` - Create new schedule
- \`payware_products_get_schedule\` - Get specific schedule details
- \`payware_products_update_schedule\` - Update existing schedule
- \`payware_products_delete_schedule\` - Delete schedule`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Schedules**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}`
        }]
      };
    }
  }
};

/**
 * Get specific schedule tool implementation for merchants
 */
export const getScheduleTool = {
  name: "payware_products_get_schedule",
  description: "Get detailed information about a specific price schedule",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      scheduleId: {
        type: "number",
        description: "Schedule identifier"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)",
        default: getPrivateKeySafe()
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId", "scheduleId"]
  },

  async handler(args) {
    const {
      productId,
      scheduleId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId || !scheduleId) {
      throw new Error("Product ID and schedule ID are required");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

    try {
      const result = await getSchedule({
        productId,
        scheduleId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const schedule = result.data;

      return {
        content: [{
          type: "text",
          text: `📅 **Schedule Details**

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
- To: ${schedule.dateTo}

**API Response:**
\`\`\`json
${JSON.stringify(schedule, null, 2)}
\`\`\`

**Available Actions:**
- \`payware_products_update_schedule\` - Update this schedule
- \`payware_products_delete_schedule\` - Delete this schedule`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to Get Schedule**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Schedule ID: ${scheduleId}`
        }]
      };
    }
  }
};

/**
 * Update schedule tool implementation for merchants
 */
export const updateScheduleTool = {
  name: "payware_products_update_schedule",
  description: "Update an existing price schedule. Only provide fields you want to change.",

  inputSchema: {
    type: "object",
    properties: {
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
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)",
        default: getPrivateKeySafe()
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId", "scheduleId"]
  },

  async handler(args) {
    const {
      productId,
      scheduleId,
      description,
      priceCorrection,
      correctionType,
      correctionValue,
      dateFrom,
      dateTo,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId || !scheduleId) {
      throw new Error("Product ID and schedule ID are required");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

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
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      const schedule = result.data;

      return {
        content: [{
          type: "text",
          text: `✅ **Schedule Updated Successfully**

**Updated Schedule:**
- ID: ${schedule.id}
- Product ID: ${schedule.productId}
- Description: ${schedule.description || 'No description'}
- Type: ${schedule.priceCorrection} (${schedule.correctionType})
- Value: ${schedule.correctionValue}${schedule.correctionType === 'PERCENTAGE' ? '%' : ''}
- Regular Price: ${schedule.regularPrice}
- Sale Price: ${schedule.salePrice}

**Active Period:**
- From: ${schedule.dateFrom}
- To: ${schedule.dateTo}

**API Response:**
\`\`\`json
${JSON.stringify(schedule, null, 2)}
\`\`\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Schedule Update Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Schedule ID: ${scheduleId}`
        }]
      };
    }
  }
};

/**
 * Delete schedule tool implementation for merchants
 */
export const deleteScheduleTool = {
  name: "payware_products_delete_schedule",
  description: "Delete a price schedule. This action cannot be undone.",

  inputSchema: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Product identifier (starts with 'pr')",
        pattern: "^pr[a-zA-Z0-9]+$"
      },
      scheduleId: {
        type: "number",
        description: "Schedule identifier"
      },
      partnerId: {
        type: "string",
        description: "Merchant partner ID (uses PAYWARE_PARTNER_ID env var as default)",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication (uses environment-specific private key as default)",
        default: getPrivateKeySafe()
      },
      useSandbox: {
        type: "boolean",
        description: "Use sandbox environment",
        default: true
      }
    },
    required: ["productId", "scheduleId"]
  },

  async handler(args) {
    const {
      productId,
      scheduleId,
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(),
      useSandbox = true
    } = args;

    if (!productId || !scheduleId) {
      throw new Error("Product ID and schedule ID are required");
    }

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required");
    }

    try {
      const result = await deletePriceSchedule({
        productId,
        scheduleId,
        partnerType: 'merchant',
        partnerId,
        privateKey,
        useSandbox
      });

      return {
        content: [{
          type: "text",
          text: `🗑️ **Schedule Deleted Successfully**

**Deleted Schedule:**
- Product ID: ${productId}
- Schedule ID: ${scheduleId}

**API Call Details:**
- Endpoint: ${result.requestInfo.method} ${result.requestInfo.url}
- Status: ${result.requestInfo.statusCode}

**Important Notes:**
⚠️ This action cannot be undone
⚠️ Product pricing may change if this was an active schedule

**Next Steps:**
- Use \`payware_products_get_schedules\` to view remaining schedules
- Check current product sale price with \`payware_products_get_product\``
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Schedule Deletion Failed**

**Error Details:**
- Message: ${error.message}
- Product ID: ${productId}
- Schedule ID: ${scheduleId}`
        }]
      };
    }
  }
};