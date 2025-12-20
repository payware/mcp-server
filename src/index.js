#!/usr/bin/env node

/**
 * payware MCP Server with Partner Type Support
 * Dynamically loads tools based on partner type (merchant, isv, payment_institution)
 * Provides authentication and transaction tools for payware API integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

// Import partner type and configuration
import { getPartnerTypeSafe, getPartnerType } from './config/env.js';
import { getPartnerConfig, getPartnerDisplayInfo } from './config/partner-types.js';

// Import tool registries
import { getSharedTools } from './shared/index.js';
import { getMerchantTools } from './merchant/index.js';
import { getISVTools } from './isv/index.js';
import { getPaymentInstitutionTools } from './payment-institution/index.js';

class PaywareMCPServer {
  constructor() {
    this.partnerType = getPartnerTypeSafe();
    this.partnerConfig = getPartnerConfig(this.partnerType);
    this.partnerInfo = getPartnerDisplayInfo(this.partnerType);

    this.server = new Server(
      {
        name: `payware-mcp-server-${this.partnerType}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tools = this.loadPartnerTools();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  /**
   * Load tools based on partner type
   * @returns {Array} Combined array of shared and partner-specific tools
   */
  loadPartnerTools() {
    let allTools = [];

    switch (this.partnerType) {
      case 'merchant':
        allTools = getMerchantTools();
        break;
      case 'isv':
        allTools = getISVTools();
        break;
      case 'payment_institution':
        allTools = getPaymentInstitutionTools();
        break;
      default:
        // Send warning to stderr to avoid MCP protocol corruption
        process.stderr.write(`Warning: Unknown partner type: ${this.partnerType}, defaulting to merchant tools\n`);
        allTools = getMerchantTools();
    }

    // Only log in development mode to avoid interfering with MCP transport
    // Debugging disabled to prevent MCP JSON-RPC protocol corruption
    // These logs interfere with the MCP client communication
    // console.log messages on stdout break the JSON-RPC protocol
    return allTools;
  }

  setupToolHandlers() {
    // MCP protocol requires clean JSON-RPC communication over stdio
    // Any console.log to stdout will corrupt the protocol and cause
    // "Unexpected end of JSON input" and "not valid JSON" errors
    // All debugging output has been permanently disabled

    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map(tool => ({
          name: tool.name,
          description: `[${this.partnerInfo.name}] ${tool.description}`,
          inputSchema: tool.inputSchema
        }))
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const timestamp = new Date().toISOString();

      // Find the tool by name
      const tool = this.tools.find(t => t.name === name);
      
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
      }

      try {
        // Call the tool's handler with execution metadata
        const startTime = Date.now();
        const result = await tool.handler(args || {});
        const duration = Date.now() - startTime;
        
        // Add execution metadata to response
        if (result && result.content && Array.isArray(result.content)) {
          result.content.forEach(content => {
            if (content.type === 'text') {
              content.text += `\n\n---\n**Execution Info:**\n- Partner Type: ${this.partnerInfo.name}\n- Tool: ${name}\n- Executed: ${timestamp}\n- Duration: ${duration}ms\n- Process ID: ${process.pid}\n- Status: ✅ Success`;
            }
          });
        }
        
        return result;
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error.message}`
        );
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      // MCP server error - will be handled by client
      // Don't output anything to stdout to avoid protocol corruption
    };

    process.on('SIGINT', async () => {
      // Graceful shutdown without any console output
      try {
        await this.server.close();
      } catch (error) {
        // Ignore shutdown errors to prevent console output
      }
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      // Handle SIGTERM gracefully without console output
      try {
        await this.server.close();
      } catch (error) {
        // Ignore shutdown errors to prevent console output
      }
      process.exit(0);
    });

    // Prevent any unhandled promise rejections from outputting to console
    process.on('unhandledRejection', (reason, promise) => {
      // Send to stderr to avoid MCP protocol corruption
      process.stderr.write(`Unhandled promise rejection: ${reason}\n`);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // MCP server ready - no console output needed
  }
}

// COMPREHENSIVE stdout protection for MCP protocol
// Hijack ALL console methods that could output to stdout
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
  trace: console.trace
};

// Redirect all console output to stderr to prevent MCP protocol corruption
console.log = (...args) => process.stderr.write(`[LOG] ${args.join(' ')}\n`);
console.info = (...args) => process.stderr.write(`[INFO] ${args.join(' ')}\n`);
console.warn = (...args) => process.stderr.write(`[WARN] ${args.join(' ')}\n`);
console.error = (...args) => process.stderr.write(`[ERROR] ${args.join(' ')}\n`);
console.debug = (...args) => process.stderr.write(`[DEBUG] ${args.join(' ')}\n`);
console.trace = (...args) => process.stderr.write(`[TRACE] ${args.join(' ')}\n`);

// Hijack process.stdout.write to catch any direct writes
const originalStdoutWrite = process.stdout.write;
process.stdout.write = function(chunk, encoding, callback) {
  // Only allow JSON-RPC messages through (they should start with { or be buffers)
  const str = chunk.toString();

  // Allow JSON-RPC messages (start with { or [, or are empty/whitespace)
  if (str.startsWith('{') || str.startsWith('[') || str.trim() === '') {
    return originalStdoutWrite.call(this, chunk, encoding, callback);
  }

  // Block anything that looks like text messages (especially shutdown messages)
  if (str.toLowerCase().includes('shutting') ||
      str.toLowerCase().includes('closing') ||
      str.toLowerCase().includes('stopping') ||
      str.toLowerCase().includes('exit')) {
    process.stderr.write(`[MCP STDOUT BLOCKED] ${str}`);
    if (callback) callback();
    return true;
  }

  // Block any other non-JSON content
  process.stderr.write(`[STDOUT BLOCKED] ${str}`);
  if (callback) callback();
  return true;
};

// Also override process exit handlers to be completely silent
const originalExit = process.exit;
process.exit = function(code) {
  // Exit silently without any output
  originalExit.call(this, code);
};

// Start the server
const server = new PaywareMCPServer();
server.run().catch(error => {
  // Send error to stderr (not stdout) to avoid MCP protocol corruption
  process.stderr.write(`Failed to start payware MCP Server: ${error.message}\n`);
  process.exit(1);
});