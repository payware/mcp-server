#!/usr/bin/env node

/**
 * HTTP Proxy Server for payware MCP
 * Provides HTTP/REST interface to the MCP server for external access
 */

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import './config/env.js'; // Load environment variables
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PaywareMCPProxy {
  constructor(port = 3001) {
    this.app = express();
    this.port = port;
    this.mcpProcess = null;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // SEC-018: CORS was `origin: true` with credentials - it reflected ANY requesting origin, so any
    // web page the operator visited could drive these routes from their browser. The routes below
    // mint JWTs with the configured partner's private key and call the payware API as that partner,
    // so this is not a cosmetic default. Restricted to explicit local origins; set
    // PAYWARE_MCP_PROXY_ORIGINS (comma-separated) to widen it deliberately.
    const allowedOrigins = (process.env.PAYWARE_MCP_PROXY_ORIGINS
      || `http://localhost:${this.port},http://127.0.0.1:${this.port}`)
      .split(',').map((o) => o.trim()).filter(Boolean);
    this.app.use(cors({
      origin: allowedOrigins,
      credentials: true
    }));
    
    // Parse JSON requests
    this.app.use(express.json());
    
    // Add request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'payware-mcp-proxy',
        version: '1.0.0'
      });
    });

    // List available tools
    this.app.get('/tools', async (req, res) => {
      try {
        const result = await this.callMCPTool('tools/list', {});
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to list tools',
          message: error.message
        });
      }
    });

    // Call a specific tool
    this.app.post('/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body || {};

        const result = await this.callMCPTool('tools/call', {
          name: toolName,
          arguments: args
        });

        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: `Failed to call tool ${req.params.toolName}`,
          message: error.message
        });
      }
    });

    // Generic MCP endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        const { method, params } = req.body;
        const result = await this.callMCPTool(method, params);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: 'MCP call failed',
          message: error.message
        });
      }
    });

    // Serve API documentation
    this.app.get('/', (req, res) => {
      res.json({
        name: 'payware MCP Proxy',
        version: '1.0.0',
        endpoints: {
          'GET /health': 'Health check',
          'GET /tools': 'List available MCP tools',
          'POST /tools/:toolName': 'Call a specific tool',
          'POST /mcp': 'Generic MCP method call'
        },
        examples: {
          listTools: 'GET /tools',
          generateKeys: 'POST /tools/generate_rsa_keys',
          createJWT: 'POST /tools/create_jwt_token'
        }
      });
    });
  }

  async callMCPTool(method, params = {}) {
    return new Promise((resolve, reject) => {
      const mcpServerPath = join(__dirname, 'index.js');
      const mcpProcess = spawn('node', [mcpServerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env // Pass environment variables to spawned process
      });

      let responseData = '';
      let errorData = '';

      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      };

      mcpProcess.stdout.on('data', (data) => {
        responseData += data.toString();
      });

      mcpProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      mcpProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse the last valid JSON response
            const lines = responseData.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const result = JSON.parse(lastLine);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse MCP response: ${parseError.message}`));
          }
        } else {
          reject(new Error(`MCP process failed with code ${code}: ${errorData}`));
        }
      });

      // Send the request to the MCP server
      mcpProcess.stdin.write(JSON.stringify(request) + '\n');
      mcpProcess.stdin.end();
    });
  }

  async start() {
    // SEC-018: loopback by default. This bound 0.0.0.0 - every interface - with no authentication on
    // /tools, /tools/:toolName or /mcp, each of which spawns the MCP server with the process env
    // (PAYWARE_PARTNER_ID and the sandbox/production private key paths) and can therefore sign as
    // that partner. On a shared dev host or an office LAN that is partner impersonation over plain
    // HTTP, and with a production key it is total. The stdio transport (mcp-proxy.js) is the normal
    // path and opens no socket at all.
    //
    // A wider bind is now an explicit opt-in via PAYWARE_MCP_PROXY_HOST, so exposing it is a
    // decision someone made rather than the default they inherited.
    const host = process.env.PAYWARE_MCP_PROXY_HOST || '127.0.0.1';
    if (host !== '127.0.0.1' && host !== 'localhost') {
      console.warn(`⚠️  MCP proxy binding ${host} - these routes are UNAUTHENTICATED and can sign as `
        + `the configured partner. Only do this on a network you control.`);
    }
    this.app.listen(this.port, host, () => {
      console.log(`🚀 payware MCP Proxy Server running on http://${host}:${this.port}`);
      console.log(`📚 API Documentation: http://localhost:${this.port}`);
      console.log(`🔧 Health Check: http://localhost:${this.port}/health`);
      console.log(`🛠️  Tools List: http://localhost:${this.port}/tools`);
    });
  }

  async stop() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down proxy server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down proxy server...');
  process.exit(0);
});

// Start the proxy server
const port = process.env.PROXY_PORT || 3001;
const proxy = new PaywareMCPProxy(port);
proxy.start().catch(error => {
  console.error('❌ Failed to start proxy server:', error);
  process.exit(1);
});

export default PaywareMCPProxy;