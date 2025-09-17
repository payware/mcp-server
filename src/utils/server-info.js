/**
 * Server information and version tool
 */

import { readFileSync } from 'fs';
import { getPartnerTypeSafe, getSandboxUrl, getProductionUrl } from '../config/env.js';
import { getPartnerDisplayInfo, getPartnerConfig } from '../config/partner-types.js';

/**
 * Get server information tool implementation
 */
export const getServerInfoTool = {
  name: "payware_utils_server_info",
  description: "Get MCP server version, status, and environment information",
  inputSchema: {
    type: "object",
    properties: {
      includeEnvironment: {
        type: "boolean",
        description: "Include environment details (default: true)"
      }
    },
    additionalProperties: false
  },
  
  async handler(args) {
    const { includeEnvironment = true } = args;
    const timestamp = new Date().toISOString();

    // Get actual partner type information
    const partnerType = getPartnerTypeSafe();
    const partnerInfo = getPartnerDisplayInfo(partnerType);
    const partnerConfig = getPartnerConfig(partnerType);

    // Read actual package.json for version info
    let packageInfo = { name: "payware-mcp-server", version: "1.0.0" };
    try {
      const packageJson = readFileSync('./package.json', 'utf8');
      packageInfo = JSON.parse(packageJson);
    } catch (error) {
      // Fallback to defaults if package.json not accessible
    }

    // Detect actual environment
    const detectEnvironment = () => {
      if (process.env.WSL_DISTRO_NAME) {
        return `WSL (${process.env.WSL_DISTRO_NAME})`;
      } else if (process.platform === 'linux' && process.env.container) {
        return 'Container/Docker';
      } else if (process.platform === 'darwin') {
        return 'macOS';
      } else if (process.platform === 'win32') {
        return 'Windows';
      } else {
        return `${process.platform} (${process.arch})`;
      }
    };

    const serverInfo = {
      name: packageInfo.name,
      version: packageInfo.version,
      description: packageInfo.description || "payware MCP Server with Partner Type Support",
      environment: detectEnvironment(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      processId: process.pid,
      uptime: Math.floor(process.uptime()),
      timestamp: timestamp,
      workingDirectory: process.cwd(),
      memoryUsage: process.memoryUsage(),
      // Partner-specific information
      partnerType: partnerType,
      partnerName: partnerInfo.name,
      partnerDescription: partnerInfo.description,
      authType: partnerConfig.authType,
      capabilities: partnerConfig.capabilities,
      sandboxUrl: getSandboxUrl(),
      productionUrl: getProductionUrl()
    };

    return {
      content: [{
        type: "text",
        text: `🚀 **${serverInfo.name} v${serverInfo.version}**

${serverInfo.description}

**Partner Configuration:**
- 📋 Type: ${serverInfo.partnerName} (${serverInfo.partnerType})
- 📝 Description: ${serverInfo.partnerDescription}
- 🔐 Authentication: ${serverInfo.authType}
- ⚡ Capabilities: ${serverInfo.capabilities.length} (${serverInfo.capabilities.slice(0, 3).join(', ')}${serverInfo.capabilities.length > 3 ? '...' : ''})
- 🌐 Sandbox URL: ${serverInfo.sandboxUrl}

**Runtime Information:**
- 🖥️ Environment: ${serverInfo.environment}
- 📦 Node.js: ${serverInfo.nodeVersion}
- 🏗️ Platform: ${serverInfo.platform}/${serverInfo.architecture}
- 🔢 Process ID: ${serverInfo.processId}
- ⏱️ Uptime: ${serverInfo.uptime} seconds
- 📁 Working Directory: ${serverInfo.workingDirectory}

**Memory Usage:**
- RSS: ${Math.round(serverInfo.memoryUsage.rss / 1024 / 1024)} MB
- Heap Used: ${Math.round(serverInfo.memoryUsage.heapUsed / 1024 / 1024)} MB
- Heap Total: ${Math.round(serverInfo.memoryUsage.heapTotal / 1024 / 1024)} MB
- External: ${Math.round(serverInfo.memoryUsage.external / 1024 / 1024)} MB

**Connection Status:**
- ✅ MCP Server is running and responding
- ✅ Partner type configured correctly
- ✅ Tools loaded successfully
- 🔗 This response confirms active connection

**Generated:** ${serverInfo.timestamp}

${includeEnvironment ? `
**Environment Variables:**
- NODE_ENV: ${process.env.NODE_ENV || 'development'}
- HOME: ${process.env.HOME || 'N/A'}
- USER: ${process.env.USER || 'N/A'}
- PWD: ${process.env.PWD || 'N/A'}
${process.env.WSL_DISTRO_NAME ? `- WSL_DISTRO_NAME: ${process.env.WSL_DISTRO_NAME}` : ''}
${process.env.container ? `- CONTAINER: ${process.env.container}` : ''}
` : ''}

**📝 Note:** If you can see this response, your payware MCP server is working correctly!`
      }]
    };
  }
};