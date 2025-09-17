/**
 * Data operations examples (shared across all partner types)
 */

import { ExampleGenerator, CommonTemplates } from '../common/helpers.js';

/**
 * Data operations available to all partner types
 */
export const DataOperations = {
  generate_report: {
    description: 'Generate a data report',
    endpoint: '/data/reports',
    method: 'POST',
    sampleBody: {
      reportType: 'TRANSACTION_SUMMARY',
      dateRange: {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z'
      },
      filters: {
        status: ['COMPLETED', 'CANCELLED'],
        currency: 'EUR',
        minAmount: '1.00',
        maxAmount: '1000.00'
      },
      format: 'JSON',
      includeDetails: true
    }
  },

  get_report_status: {
    description: 'Get status of a generated report',
    endpoint: '/data/reports/{id}',
    method: 'GET',
    sampleBody: null
  },

  export_report: {
    description: 'Export report data in specified format',
    endpoint: '/data/exports',
    method: 'POST',
    sampleBody: {
      reportId: 'rpt_example_123',
      format: 'CSV',
      exportOptions: {
        compression: 'gzip',
        includeHeaders: true,
        delimiter: ',',
        encoding: 'UTF-8'
      }
    }
  },

  download_export: {
    description: 'Download exported report file',
    endpoint: '/data/exports/{id}',
    method: 'GET',
    sampleBody: null,
    responseType: 'file'
  },

  cancel_report: {
    description: 'Cancel a running report generation',
    endpoint: '/data/reports/{id}',
    method: 'DELETE',
    sampleBody: {
      reason: 'User cancelled operation'
    }
  },

  list_reports: {
    description: 'List all reports for partner',
    endpoint: '/data/reports',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      limit: 20,
      offset: 0,
      status: 'COMPLETED',
      reportType: 'TRANSACTION_SUMMARY'
    }
  },

  get_analytics_summary: {
    description: 'Get analytics summary for partner',
    endpoint: '/data/analytics/summary',
    method: 'GET',
    sampleBody: null,
    queryParams: {
      period: '30d',
      metrics: 'transactions,revenue,fees',
      granularity: 'daily'
    }
  },

  create_custom_report: {
    description: 'Create custom report with specific parameters',
    endpoint: '/data/reports/custom',
    method: 'POST',
    sampleBody: {
      name: 'Monthly Transaction Report',
      description: 'Custom monthly transaction analysis',
      query: {
        aggregations: [
          {
            field: 'amount',
            operation: 'SUM',
            groupBy: 'currency'
          },
          {
            field: 'transactionId',
            operation: 'COUNT',
            groupBy: 'status'
          }
        ],
        filters: {
          dateField: 'createdAt',
          conditions: [
            {
              field: 'status',
              operator: 'IN',
              values: ['COMPLETED', 'PENDING']
            }
          ]
        }
      },
      schedule: {
        frequency: 'MONTHLY',
        dayOfMonth: 1,
        timezone: 'Europe/Berlin'
      }
    }
  }
};

/**
 * Python Data Operations Generator
 */
export class PythonDataGenerator extends ExampleGenerator {
  constructor() {
    super('python');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = DataOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      reportId = 'rpt_example_123',
      exportId = 'exp_example_456',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint;
    if (endpoint.includes('{id}')) {
      const id = operation.includes('export') ? exportId : reportId;
      endpoint = endpoint.replace('{id}', id);
    }

    const functionName = `${operation}_example`;

    return `def ${functionName}(${this.getFunctionParams(operation, reportId, exportId)}, use_sandbox=True):
    """${opConfig.description}"""

    try:
        # Get API configuration
        base_url = get_api_base_url(use_sandbox)
        endpoint = '${endpoint}'
        url = f"{base_url}{endpoint}"

        ${this.getQueryParamsSection(operation, opConfig)}
        ${this.getRequestBodySection(operation, opConfig, reportId)}

        # Create JWT token
        token, body_string = create_jwt_token(request_body, use_sandbox)
        headers = get_api_headers(token)

        ${this.getSpecialHandling(operation, opConfig)}

        ${this.getRequestSection(opConfig.method, opConfig.responseType)}

        ${this.getResponseHandling(operation, opConfig)}

    except requests.exceptions.RequestException as e:
        print(f"Request error: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return None

# Example usage
if __name__ == "__main__":
    print("Data Operations Example")

    # ${opConfig.description}
    result = ${functionName}()

    if result:
        print("Data operation completed successfully")
        ${this.getUsageExample(operation)}
    else:
        print("Data operation failed")`;
  }

  getFunctionParams(operation, reportId, exportId) {
    const params = [];

    if (operation.includes('report') && operation !== 'generate_report' && operation !== 'list_reports') {
      params.push(`report_id='${reportId}'`);
    }
    if (operation.includes('export') && operation !== 'export_report') {
      params.push(`export_id='${exportId}'`);
    }

    return params.join(', ');
  }

  getQueryParamsSection(operation, opConfig) {
    if (!opConfig.queryParams) {
      return '';
    }

    const paramsStr = Object.entries(opConfig.queryParams)
      .map(([key, value]) => `        '${key}': ${typeof value === 'string' ? `'${value}'` : value}`)
      .join(',\n');

    return `# Add query parameters
    params = {
${paramsStr}
    }
    if params:
        url += '?' + '&'.join([f"{k}={v}" for k, v in params.items()])`;
  }

  getRequestBodySection(operation, opConfig, reportId) {
    if (!opConfig.sampleBody) {
      return '# No request body needed for this operation\n        request_body = None';
    }

    let body = { ...opConfig.sampleBody };

    // Replace placeholder values
    if (body.reportId) {
      body.reportId = reportId;
    }

    const bodyStr = JSON.stringify(body, null, 8).replace(/^/gm, '        ');
    return `# Prepare request body
        request_body = ${bodyStr}`;
  }

  getSpecialHandling(operation, opConfig) {
    if (operation === 'download_export') {
      return `# Set headers for file download
        headers['Accept'] = 'application/octet-stream'`;
    }
    return '';
  }

  getRequestSection(method, responseType) {
    if (method === 'GET') {
      if (responseType === 'file') {
        return `response = requests.get(url, headers=headers, stream=True)`;
      }
      return 'response = requests.get(url, headers=headers)';
    } else if (method === 'DELETE') {
      return 'response = requests.delete(url, headers=headers, data=body_string if request_body else None)';
    } else {
      return `response = requests.${method.toLowerCase()}(
            url,
            headers=headers,
            data=body_string if request_body else None
        )`;
    }
  }

  getResponseHandling(operation, opConfig) {
    if (opConfig.responseType === 'file') {
      return `if response.status_code == 200:
            # Handle file download
            filename = f"export_{export_id}.{opConfig.format.lower() if opConfig.format else 'dat'}"

            with open(filename, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"File downloaded successfully: {filename}")
            return filename
        else:
            error_msg = f"Download failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None`;
    } else {
      return `if response.status_code == 200:
            result = response.json()
            print(f"${opConfig.description} successful:")
            print(json.dumps(result, indent=2))
            return result
        else:
            error_msg = f"Request failed with status {response.status_code}: {response.text}"
            print(error_msg)
            return None`;
    }
  }

  getUsageExample(operation) {
    const examples = {
      generate_report: `# Store report ID for status checking
        if 'reportId' in result:
            report_id = result['reportId']
            print(f"Report generation started: {report_id}")
            print("Use get_report_status_example(report_id) to check progress")`,

      get_report_status: `# Check if report is ready
        status = result.get('status')
        if status == 'COMPLETED':
            print("Report is ready for download")
        elif status == 'PROCESSING':
            print("Report is still being generated")
        elif status == 'FAILED':
            print(f"Report generation failed: {result.get('error')}")`,

      export_report: `# Start export process
        if 'exportId' in result:
            export_id = result['exportId']
            print(f"Export started: {export_id}")
            print("Use download_export_example(export_id) when ready")`,

      get_analytics_summary: `# Display analytics summary
        metrics = result.get('metrics', {})
        for metric, value in metrics.items():
            print(f"- {metric}: {value}")

        trends = result.get('trends', {})
        if trends:
            print("\\nTrends:")
            for period, data in trends.items():
                print(f"- {period}: {data}")`
    };

    return examples[operation] || '# Process data result as needed';
  }
}

/**
 * Node.js Data Operations Generator
 */
export class NodeJSDataGenerator extends ExampleGenerator {
  constructor() {
    super('nodejs');
  }

  getOperationTemplate(operation, partnerType, params = {}) {
    const opConfig = DataOperations[operation];
    if (!opConfig) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const {
      reportId = 'rpt_example_123',
      exportId = 'exp_example_456',
      ...otherParams
    } = params;

    let endpoint = opConfig.endpoint;
    if (endpoint.includes('{id}')) {
      const id = operation.includes('export') ? exportId : reportId;
      endpoint = endpoint.replace('{id}', id);
    }

    const functionName = `${operation}Example`;

    return `async function ${functionName}(${this.getFunctionParams(operation, reportId, exportId)}, useSandbox = true) {
  /**
   * ${opConfig.description}
   */

  try {
    // Get API configuration
    const baseUrl = getAPIBaseURL(useSandbox);
    const endpoint = '${endpoint}';
    let url = \`\${baseUrl}\${endpoint}\`;

    ${this.getQueryParamsSection(operation, opConfig)}
    ${this.getRequestBodySection(operation, opConfig, reportId)}

    // Create JWT token
    const { token, bodyString } = createJWTToken(requestBody, useSandbox);
    const headers = getAPIHeaders(token);

    ${this.getSpecialHandling(operation, opConfig)}

    ${this.getRequestSection(opConfig.method, opConfig.responseType)}

    ${this.getResponseHandling(operation, opConfig)}

  } catch (error) {
    if (error.response) {
      console.error(\`API Error: \${error.response.status} - \${error.response.data}\`);
    } else {
      console.error('Request Error:', error.message);
    }
    return null;
  }
}

// Example usage
async function main() {
  console.log('Data Operations Example');

  try {
    const result = await ${functionName}();

    if (result) {
      console.log('Data operation completed successfully');
      ${this.getUsageExample(operation)}
    } else {
      console.log('Data operation failed');
    }

  } catch (error) {
    console.error('Data operation error:', error.message);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}`;
  }

  getFunctionParams(operation, reportId, exportId) {
    const params = [];

    if (operation.includes('report') && operation !== 'generate_report' && operation !== 'list_reports') {
      params.push(`reportId = '${reportId}'`);
    }
    if (operation.includes('export') && operation !== 'export_report') {
      params.push(`exportId = '${exportId}'`);
    }

    return params.join(', ');
  }

  getQueryParamsSection(operation, opConfig) {
    if (!opConfig.queryParams) {
      return '';
    }

    const paramsStr = JSON.stringify(opConfig.queryParams, null, 4).replace(/^/gm, '    ');
    return `// Add query parameters
    const queryParams = ${paramsStr};
    const searchParams = new URLSearchParams(queryParams);
    url += \`?\${searchParams.toString()}\`;`;
  }

  getRequestBodySection(operation, opConfig, reportId) {
    if (!opConfig.sampleBody) {
      return '// No request body needed for this operation\n    const requestBody = null;';
    }

    let body = { ...opConfig.sampleBody };

    // Replace placeholder values
    if (body.reportId) {
      body.reportId = reportId;
    }

    const bodyStr = JSON.stringify(body, null, 4).replace(/^/gm, '    ');
    return `// Prepare request body
    const requestBody = ${bodyStr};`;
  }

  getSpecialHandling(operation, opConfig) {
    if (operation === 'download_export') {
      return `// Set headers for file download
    headers['Accept'] = 'application/octet-stream';`;
    }
    return '';
  }

  getRequestSection(method, responseType) {
    if (method === 'GET') {
      if (responseType === 'file') {
        return `const response = await axios.get(url, {
      headers,
      responseType: 'stream'
    });`;
      }
      return 'const response = await axios.get(url, { headers });';
    } else if (method === 'DELETE') {
      return `const response = await axios.delete(url, {
      headers,
      data: bodyString || undefined
    });`;
    } else {
      return `const response = await axios.${method.toLowerCase()}(
      url,
      bodyString || undefined,
      { headers }
    );`;
    }
  }

  getResponseHandling(operation, opConfig) {
    if (opConfig.responseType === 'file') {
      return `if (response.status === 200) {
      // Handle file download
      const fs = require('fs');
      const filename = \`export_\${exportId}.\${opConfig.format?.toLowerCase() || 'dat'}\`;

      const writer = fs.createWriteStream(filename);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(\`File downloaded successfully: \${filename}\`);
          resolve(filename);
        });
        writer.on('error', reject);
      });
    } else {
      console.error(\`Download failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }`;
    } else {
      return `if (response.status === 200) {
      const result = response.data;
      console.log('${opConfig.description} successful:');
      console.log(JSON.stringify(result, null, 2));
      return result;
    } else {
      console.error(\`Request failed with status \${response.status}: \${response.statusText}\`);
      return null;
    }`;
    }
  }

  getUsageExample(operation) {
    const examples = {
      generate_report: `// Store report ID for status checking
      if (result.reportId) {
        const reportId = result.reportId;
        console.log(\`Report generation started: \${reportId}\`);
        console.log('Use getReportStatusExample(reportId) to check progress');
      }`,

      get_report_status: `// Check if report is ready
      const status = result.status;
      if (status === 'COMPLETED') {
        console.log('Report is ready for download');
      } else if (status === 'PROCESSING') {
        console.log('Report is still being generated');
      } else if (status === 'FAILED') {
        console.log(\`Report generation failed: \${result.error}\`);
      }`,

      export_report: `// Start export process
      if (result.exportId) {
        const exportId = result.exportId;
        console.log(\`Export started: \${exportId}\`);
        console.log('Use downloadExportExample(exportId) when ready');
      }`,

      get_analytics_summary: `// Display analytics summary
      const metrics = result.metrics || {};
      Object.entries(metrics).forEach(([metric, value]) => {
        console.log(\`- \${metric}: \${value}\`);
      });

      const trends = result.trends || {};
      if (Object.keys(trends).length > 0) {
        console.log('\\nTrends:');
        Object.entries(trends).forEach(([period, data]) => {
          console.log(\`- \${period}:\`, data);
        });
      }`
    };

    return examples[operation] || '// Process data result as needed';
  }
}

/**
 * Export all generators
 */
export const DataGenerators = {
  python: PythonDataGenerator,
  nodejs: NodeJSDataGenerator,
  javascript: NodeJSDataGenerator
};

/**
 * Generate data operation example
 */
export function generateDataExample(operation, language = 'python', partnerType = 'merchant', options = {}) {
  const GeneratorClass = DataGenerators[language];
  if (!GeneratorClass) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const generator = new GeneratorClass();
  return generator.generateExample(operation, partnerType, options);
}