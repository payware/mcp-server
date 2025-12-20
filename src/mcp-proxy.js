#!/usr/bin/env node

/**
 * MCP-to-HTTP Bridge for payware MCP Server
 * Provides proper MCP transport (stdio) that bridges to HTTP endpoints
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import './config/env.js'; // Load environment variables
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

class PaywareMCPBridge {
  constructor(httpServerUrl = 'http://localhost:3001') {
    this.httpServerUrl = httpServerUrl;
    this.server = new Server(
      {
        name: 'payware-mcp-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    // List tools handler - proxy to HTTP server
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const response = await axios.get(`${this.httpServerUrl}/tools`, {
          timeout: 5000
        });
        
        if (response.data && response.data.result && response.data.result.tools) {
          return { tools: response.data.result.tools };
        } else {
          throw new Error('Invalid response format from HTTP server');
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list tools from HTTP server: ${error.message}`
        );
      }
    });

    // Call tool handler - proxy to HTTP server
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const response = await axios.post(`${this.httpServerUrl}/tools/${name}`, args || {}, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });
        
        // Handle both direct result and JSON-RPC wrapped responses
        if (response.data && response.data.result) {
          return response.data.result;
        } else if (response.data && !response.data.error) {
          // Direct response without JSON-RPC wrapper
          return response.data;
        } else if (response.data && response.data.error) {
          // JSON-RPC error response - preserve the original error message
          const errorMessage = response.data.error.message || 'Tool execution failed';
          console.error(`[Bridge] HTTP proxy returned error: ${errorMessage}`);
          throw new Error(errorMessage);
        } else {
          throw new Error('Invalid response format from HTTP server');
        }
      } catch (error) {
        if (error.response) {
          // HTTP error response
          const errorMsg = error.response.data?.message || error.response.statusText || 'HTTP request failed';
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${errorMsg}`
          );
        } else if (error.request) {
          // Network error
          throw new McpError(
            ErrorCode.InternalError,
            `Network error: Failed to connect to HTTP server at ${this.httpServerUrl}`
          );
        } else {
          // Other error
          throw new McpError(
            ErrorCode.InternalError,
            `Unexpected error: ${error.message}`
          );
        }
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('MCP Bridge error:', error);
    };

    process.on('SIGINT', async () => {
      console.error('\nShutting down MCP Bridge...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('\nShutting down MCP Bridge...');
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    // Test connection to HTTP server first
    try {
      const response = await axios.get(`${this.httpServerUrl}/health`, { timeout: 5000 });
      console.error(`✅ Connected to HTTP server: ${response.data.service} v${response.data.version}`);
    } catch (error) {
      console.error(`❌ Failed to connect to HTTP server at ${this.httpServerUrl}`);
      console.error('Make sure the HTTP proxy server is running with: npm run proxy');
      process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🔗 MCP Bridge ready - connected to payware HTTP proxy');
  }
}

// Start the bridge
const httpServerUrl = process.env.HTTP_SERVER_URL || 'http://localhost:3001';
const bridge = new PaywareMCPBridge(httpServerUrl);

bridge.run().catch(error => {
  console.error('❌ Failed to start MCP Bridge:', error.message);
  process.exit(1);
});