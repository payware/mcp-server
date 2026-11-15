import { generateReport, REPORT_TYPES, LOCALES, PERIOD_PROPERTY } from '../../shared/data/data-api.js';
import { getPartnerIdSafe, getPrivateKeySafe } from '../../config/env.js';
import { CREATES } from '../../shared/tool-annotations.js';

/**
 * Generate report tool for merchants
 */
export const generateReportTool = {
  name: "payware_data_generate_report",
  annotations: CREATES,
  description: `Generate an asynchronous data report for merchant data analysis and reporting. Production only - not supported in sandbox.

⚠️ **Running a report is entitlement-checked as of 2026-08-22.** Naming a report answers **403
\`ERR_REPORT_NOT_AVAILABLE\`** when that report is not included in the caller's plan or partner type.
Until that date only the *menu* was filtered - the door was not - so a caller that hard-coded a
report id it had never been offered could still run it, and may now start failing.

**Always resolve the id from \`payware_data_list_reports\` rather than hard-coding one.** That call
and this check share a single rule, so the menu and the door cannot drift apart: if a report is in
that list, this call will accept it.

Distinguish the two failures:
- **403 \`ERR_REPORT_NOT_AVAILABLE\`** - the report exists, this caller may not run it. Not retryable;
  it is a plan boundary, not a transient error.
- **404 \`ERR_REPORT_UNIT_ID_NOT_FOUND\`** - no report is registered under that id at all. Usually a
  typo or a stale id.

For an ISV acting on behalf of a merchant, the plan that applies is the **merchant's**, and reports
are outside the Basic plan entirely.`,
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
        description: "Start date (YYYY-MM-DD), with period CUSTOM or no period. Ignored with any other preset.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      },
      dateTo: {
        type: "string",
        description: "End date (YYYY-MM-DD), with period CUSTOM or no period. Only an end date covers that one day; no end on a range is today.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      },
      period: PERIOD_PROPERTY,
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
      period,
      ignorePagination = false,
      locale = LOCALES.ENGLISH_US,
      timeZone = 'GMT',
      partnerId = getPartnerIdSafe(),
      privateKey = getPrivateKeySafe(false)  // false = production (Data API is production-only)
    } = args;

    if (!partnerId || !privateKey) {
      throw new Error("Partner ID and private key are required. Set PAYWARE_PARTNER_ID and PAYWARE_PRODUCTION_PRIVATE_KEY_PATH environment variables or provide them as parameters.");
    }

    // No local date requirement: the server turns a period preset into dates in the caller's zone, and no
    // period and no dates is today, or the last closed month or quarter for a statement (ReportPeriods).

    try {
      const result = await generateReport({
        reportUnitId,
        dateFrom,
        dateTo,
        period,
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
- Period: ${period || (dateFrom || dateTo ? 'CUSTOM' : 'Default')}
- Date Range: ${dateFrom || 'Default'} to ${dateTo || 'Default'}
- Timezone: ${timeZone}
- Locale: ${locale}
- Pagination: ${ignorePagination ? 'Disabled (single document)' : 'Enabled'}

**Next Steps:**
1. Save the Request ID: \`${result.data.requestId}\`
2. Use "Get Report Status" tool to monitor progress
3. When status is "READY", use "Export Report" tool to get the data

**Which reports you may run:** payware_data_list_reports returns them for this account, with each report's \`period\` (which presets it takes) and the plan it needs.

**⚠️ Production Only:**
This feature is only available in the production environment, not in sandbox.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }
};