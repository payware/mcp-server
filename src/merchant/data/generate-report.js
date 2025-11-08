import { generateReport, REPORT_TYPES, LOCALES } from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';

/**
 * Generate report tool for merchants
 */
export const generateReportTool = {
  name: "payware_data_generate_report",
  description: "Generate an asynchronous data report for merchant data analysis and reporting. Production only - not supported in sandbox.",
  inputSchema: {
    type: "object",
    properties: {
      reportUnitId: {
        type: "string",
        description: "The ID of the report to generate",
        enum: Object.values(REPORT_TYPES),
        default: REPORT_TYPES.PROCESSED_TRANSACTIONS
      },
      dateFrom: {
        type: "string",
        description: "Start date for the reporting period (YYYY-MM-DD format). Required for premium reports.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      },
      dateTo: {
        type: "string",
        description: "End date for the reporting period (YYYY-MM-DD format). Required for premium reports.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      },
      ignorePagination: {
        type: "boolean",
        description: "If true, return report as single continuous document. If false, paginate results.",
        default: false
      },
      locale: {
        type: "string",
        description: "Locale for the report",
        enum: Object.values(LOCALES),
        default: LOCALES.ENGLISH_US
      },
      timeZone: {
        type: "string",
        description: "Timezone for date calculations (e.g., 'Europe/Sofia', 'America/New_York')",
        default: "GMT"
      },
      partnerId: {
        type: "string",
        description: "Partner ID from payware dashboard. Uses PAYWARE_PARTNER_ID env var as default.",
        default: getPartnerIdSafe()
      },
      privateKey: {
        type: "string",
        description: "RSA private key for authentication. Uses production private key as default (Data API is production-only)."
      }
    },
    required: ["reportUnitId"]
  },

  async handler(args) {
    const {
      reportUnitId,
      dateFrom,
      dateTo,
      ignorePagination = false,
      locale = LOCALES.ENGLISH_US,
      timeZone = 'GMT',
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false)  // false = production (Data API is production-only)
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }

    // Check for required date range on premium reports
    const premiumReports = [
      REPORT_TYPES.PROCESSED_TRANSACTIONS,
      REPORT_TYPES.SCHEDULES_LIST,
      REPORT_TYPES.TRANSACTIONS_PER_PRODUCT,
      REPORT_TYPES.SALES_PER_PRODUCT,
      REPORT_TYPES.TRANSACTIONS_PER_WEBPOS
    ];

    if (premiumReports.includes(reportUnitId) && (!dateFrom || !dateTo)) {
      throw new Error(`Report "${reportUnitId}" requires dateFrom and dateTo parameters (YYYY-MM-DD format)`);
    }

    try {
      const result = await generateReport({
        reportUnitId,
        dateFrom,
        dateTo,
        ignorePagination,
        locale,
        timeZone,
        partnerType: 'merchant',
        partnerId,
        privateKey
      });

      const reportType = Object.keys(REPORT_TYPES).find(key => REPORT_TYPES[key] === reportUnitId) || reportUnitId;

      return {
        content: [{
          type: "text",
          text: `📊 **Data Report Generation Started**

**Report Details:**
- Type: ${reportType}
- Report Unit ID: ${reportUnitId}
- Request ID: ${result.data.requestId}
- Status: ${result.data.status}
- Generated: ${result.data.generatedAt}

**Report Parameters:**
- Date Range: ${dateFrom || 'Default'} to ${dateTo || 'Default'}
- Timezone: ${timeZone}
- Locale: ${locale}
- Pagination: ${ignorePagination ? 'Disabled (single document)' : 'Enabled'}

**Next Steps:**
1. Save the Request ID: \`${result.data.requestId}\`
2. Use "Get Report Status" tool to monitor progress
3. When status is "READY", use "Export Report" tool to get the data

**Available Report Types:**
- **Standard Reports** (no date range required):
  - Current Week Transactions: ${REPORT_TYPES.CURRENT_WEEK_TRANSACTIONS}
  - Current Month Transactions: ${REPORT_TYPES.CURRENT_MONTH_TRANSACTIONS}
  - Current Year Transactions: ${REPORT_TYPES.CURRENT_YEAR_TRANSACTIONS}
  - Products List: ${REPORT_TYPES.PRODUCTS_LIST}
  - Shops List: ${REPORT_TYPES.SHOPS_LIST}
  - Payment Profiles: ${REPORT_TYPES.PAYMENT_PROFILES}
  - Partner Profile: ${REPORT_TYPES.PARTNER_PROFILE}

- **Premium Reports** (date range required):
  - Processed Transactions: ${REPORT_TYPES.PROCESSED_TRANSACTIONS}
  - Schedules List: ${REPORT_TYPES.SCHEDULES_LIST}
  - Transactions per Product: ${REPORT_TYPES.TRANSACTIONS_PER_PRODUCT}
  - Sales per Product: ${REPORT_TYPES.SALES_PER_PRODUCT}
  - Transactions per WebPOS: ${REPORT_TYPES.TRANSACTIONS_PER_WEBPOS}

**⚠️ Production Only:**
This feature is only available in the production environment, not in sandbox.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }
};