# payware MCP Server Distribution Guide

## Overview

This document provides comprehensive recommendations for distributing the payware MCP Server to partners and developers. The distribution package enables partners to integrate payware payment capabilities into their applications using the Model Context Protocol (MCP).

## Distribution Methods

### 1. NPM Package (Recommended Primary)

**Target Audience**: Technical partners, developers familiar with Node.js ecosystem

**Advantages**:
- Easy installation with `npm install @payware/mcp-server`
- Automatic dependency management
- Version control and updates
- Familiar distribution method for developers
- Supports semantic versioning

**Implementation**:
```bash
# Publish to NPM registry
npm publish --access public

# Partners install with:
npm install @payware/mcp-server
npm start
```

**Distribution Steps**:
1. Create NPM organization: `@payware`
2. Set up automated publishing pipeline
3. Configure semantic versioning
4. Provide installation documentation
5. Set up deprecation/migration paths for updates

---

## Step-by-Step NPM Publishing Guide

### Prerequisites

1. **NPM Account Setup**:
   - Create account at https://www.npmjs.com/signup (✓ Already completed)
   - Verify email address
   - Enable two-factor authentication (2FA) for security

2. **Login to NPM**:
   ```bash
   npm login
   # Enter your username, password, and email
   # Enter OTP if 2FA is enabled
   ```

3. **Verify Authentication**:
   ```bash
   npm whoami
   # Should display your npm username
   ```

### Preparing Your Package

#### 1. Update package.json

Your current package.json should be updated with proper npm-ready metadata:

```json
{
  "name": "@payware/mcp-server",
  "version": "1.0.0",
  "description": "Official MCP server for payware payment API integration",
  "main": "src/index.js",
  "type": "module",
  "bin": {
    "payware-mcp": "./src/index.js"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "proxy": "node src/proxy-server.js",
    "proxy:dev": "node --watch src/proxy-server.js",
    "bridge": "node src/mcp-proxy.js",
    "inspector": "npx @modelcontextprotocol/inspector node src/mcp-proxy.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "dotenv": "^17.2.2",
    "express": "^5.1.0",
    "http-proxy-middleware": "^3.0.5",
    "jsonwebtoken": "^9.0.0",
    "node-forge": "^1.3.1"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "payware",
    "payments",
    "payment-gateway",
    "api",
    "fintech",
    "pos",
    "terminal"
  ],
  "author": "payware <support@payware.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/payware/mcp-server.git"
  },
  "bugs": {
    "url": "https://github.com/payware/mcp-server/issues"
  },
  "homepage": "https://github.com/payware/mcp-server#readme",
  "files": [
    "src/",
    "keys/README.md",
    "README.md",
    "check-keys.js",
    "mcp-config.json",
    "payware-mcp-config.json",
    "claude-code-config.json",
    ".env.example"
  ]
}
```

**Key Changes Needed**:
- Change `name` from `"payware-mcp-server"` to `"@payware/mcp-server"` (requires npm organization)
- OR use `"payware-mcp-server"` without @ (no organization needed)
- Add `repository`, `bugs`, and `homepage` fields
- Add `files` array to explicitly control what gets published
- Expand `keywords` for better discoverability

#### 2. Create .npmignore File

Create a `.npmignore` file to exclude unnecessary files from the package:

```bash
# Create .npmignore in project root
cat > .npmignore << 'EOF'
# Development and testing files
*.log
npm-debug.log*
yarn-debug.log*
test-*.js
debug-*.js

# Environment and credentials
.env
*.pem
keys/*.pem
keys/*.key
!keys/README.md

# IDE and OS files
.vscode/
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db

# Git files
.git/
.gitignore
.gitattributes

# Internal documentation
internal-docs/

# Distribution files
dist/

# CI/CD files
.github/
.gitlab-ci.yml
.travis.yml

# Dependencies (will be installed by users)
node_modules/
EOF
```

**Important**: The `files` field in package.json takes precedence over `.npmignore`. Only files listed in the `files` array will be included.

#### 3. Test Package Contents

Before publishing, verify what will be included in your package:

```bash
# See what files will be published
npm pack --dry-run

# This shows you the exact list of files that will be included
# Review carefully to ensure no sensitive data is included
```

#### 4. Test Local Installation

Create a test package and install it locally:

```bash
# Create a tarball of your package
npm pack

# This creates: payware-mcp-server-1.0.0.tgz (or @payware-mcp-server-1.0.0.tgz)

# Test installation in a separate directory
mkdir /tmp/test-install
cd /tmp/test-install
npm install /path/to/your/payware-mcp-server-1.0.0.tgz

# Verify the package works
npx payware-mcp --help
# or
node node_modules/@payware/mcp-server/src/index.js

# Clean up
cd -
rm -rf /tmp/test-install
```

### Publishing to NPM

#### Option A: Publishing to NPM Without Organization (Simpler)

If you don't have an npm organization, use the package name without `@`:

```bash
# 1. Update package.json name to: "payware-mcp-server"

# 2. Publish
npm publish

# That's it! Your package is now live at:
# https://www.npmjs.com/package/payware-mcp-server
```

#### Option B: Publishing with NPM Organization (Recommended for Brand)

To use `@payware/mcp-server`, you need to create an organization:

```bash
# 1. Create organization (one-time setup)
npm org create payware
# OR use the web interface: https://www.npmjs.com/org/create

# 2. Verify organization
npm org ls payware

# 3. Update package.json name to: "@payware/mcp-server"

# 4. Publish as public package (organizations default to private)
npm publish --access public
```

**Cost Note**: Free npm accounts can create organizations and publish unlimited public packages.

### Publishing Commands

```bash
# Before first publish, verify package contents
npm pack --dry-run

# Publish version 1.0.0
npm publish --access public

# Publish with tag (for beta/alpha versions)
npm publish --tag beta --access public

# Publish with OTP (if 2FA enabled)
npm publish --otp=123456 --access public
```

### Post-Publication Verification

```bash
# 1. Verify package appears on npm
npm view @payware/mcp-server
# or
npm view payware-mcp-server

# 2. Check package metadata
npm info @payware/mcp-server

# 3. Test installation from npm
mkdir /tmp/verify-publish
cd /tmp/verify-publish
npm install @payware/mcp-server
npx payware-mcp --help

# 4. View your package online
# Visit: https://www.npmjs.com/package/@payware/mcp-server
# or: https://www.npmjs.com/package/payware-mcp-server
```

### Publishing Updates

When you make changes and want to publish a new version:

```bash
# 1. Update version (automatically updates package.json)
npm version patch   # 1.0.0 -> 1.0.1 (bug fixes)
npm version minor   # 1.0.0 -> 1.1.0 (new features)
npm version major   # 1.0.0 -> 2.0.0 (breaking changes)

# 2. Publish new version
npm publish --access public

# 3. Tag releases in git
git push --tags
```

### Troubleshooting

**Error: "Package name already taken"**
```bash
# Solution: Choose a different name or add a scope
# Example: @your-username/mcp-server or payware-mcp-server-v2
```

**Error: "You must verify your email"**
```bash
# Solution: Check your email and verify your npm account
```

**Error: "You do not have permission to publish"**
```bash
# Solution 1: Login again
npm logout
npm login

# Solution 2: If using organization, make sure you're a member
npm org ls payware
```

**Error: "You must sign in with 2FA"**
```bash
# Solution: Provide OTP code
npm publish --otp=123456 --access public
```

**Package published but not showing up**
```bash
# Wait 1-2 minutes for npm registry to update
# Clear npm cache
npm cache clean --force
```

### Security Best Practices

1. **Enable 2FA**: Protect your npm account
   ```bash
   npm profile enable-2fa auth-and-writes
   ```

2. **Use .npmignore**: Ensure no secrets are published
   - Never include `.env` files
   - Never include private keys (`*.pem`, `*.key`)
   - Exclude `internal-docs/`

3. **Review Before Publishing**:
   ```bash
   # Always check what will be published
   npm pack --dry-run
   ```

4. **Use npm tokens for CI/CD**:
   ```bash
   # Generate automation token for CI/CD pipelines
   npm token create --read-only
   ```

### Automation (Optional)

Create a `publish.sh` script for automated publishing:

```bash
#!/bin/bash
set -e

echo "🔍 Checking package contents..."
npm pack --dry-run

echo ""
read -p "Ready to publish? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 Publishing to npm..."
    npm publish --access public
    echo "✅ Published successfully!"
    echo "View at: https://www.npmjs.com/package/@payware/mcp-server"
else
    echo "❌ Publish cancelled"
fi
```

Make it executable:
```bash
chmod +x publish.sh
./publish.sh
```

### Quick Reference Commands

```bash
# Login
npm login

# Check what will be published
npm pack --dry-run

# Publish (without organization)
npm publish

# Publish (with organization)
npm publish --access public

# Update version and publish
npm version patch && npm publish --access public

# View published package
npm view @payware/mcp-server

# Unpublish (only within 72 hours)
npm unpublish @payware/mcp-server@1.0.0
```

### 2. GitHub Repository (Recommended Secondary)

**Target Audience**: Open-source contributors, technical partners wanting transparency

**Advantages**:
- Full transparency and code visibility
- Community contributions and issue tracking
- CI/CD integration
- Documentation hosting via GitHub Pages
- Release management with GitHub Releases

**Implementation**:
```bash
# Repository structure
github.com/payware/mcp-server
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── src/
├── examples/
└── docs/
```

**Distribution Steps**:
1. Create public repository: `github.com/payware/mcp-server`
2. Set up branch protection rules
3. Configure automated testing and releases
4. Create comprehensive documentation
5. Establish contribution guidelines

### 3. Direct Download (Partner Portal)

**Target Audience**: Non-technical partners, enterprise clients

**Advantages**:
- No technical knowledge required
- Controlled access and licensing
- Analytics on download patterns
- Custom documentation per partner type

**Implementation**:
- Host ZIP/TAR archives on payware developer portal
- Provide step-by-step installation guides
- Include partner-specific configuration examples
- Offer different packages per partner type (merchant, ISV, PI)

### 4. Docker Image (Future Enhancement)

**Target Audience**: DevOps teams, cloud-native deployments

**Advantages**:
- Consistent runtime environment
- Easy deployment and scaling
- Cloud platform compatibility
- Simplified dependency management

**Implementation**:
```bash
# Docker Hub distribution
docker pull payware/mcp-server:latest
docker run -p 3000:3000 payware/mcp-server:latest
```

## Recommended Distribution Strategy

### Phase 1: Foundation (Immediate)
1. **NPM Package**: Primary distribution method
   - Publish `@payware/mcp-server` to NPM
   - Target: Technical partners and developers
   - Timeline: Immediate release

2. **GitHub Repository**: Secondary method
   - Create public repository for transparency
   - Enable issue tracking and contributions
   - Timeline: Within 1 week

### Phase 2: Enhancement (1-2 months)
3. **Partner Portal Integration**:
   - Add direct download option to payware developer portal
   - Create partner-specific packages
   - Timeline: 1-2 months

4. **Documentation Portal**:
   - Comprehensive API documentation
   - Integration tutorials and examples
   - Timeline: 1-2 months

### Phase 3: Advanced (3-6 months)
5. **Docker Distribution**:
   - Container images for cloud deployment
   - Kubernetes manifests
   - Timeline: 3-6 months

6. **Package Manager Support**:
   - Homebrew formula (macOS)
   - Chocolatey package (Windows)
   - Timeline: 6 months

## Package Contents by Distribution Method

### NPM Package Contents
```
@payware/mcp-server/
├── src/                 # Complete source code
├── package.json        # Dependencies and scripts
├── README.md          # Installation and usage
├── keys/README.md     # Key setup instructions
├── examples/          # Integration examples
└── docs/             # API documentation
```

### GitHub Repository Contents
```
payware/mcp-server/
├── src/               # Source code
├── tests/            # Test suites
├── examples/         # Working examples
├── docs/            # Documentation
├── .github/         # CI/CD workflows
├── CONTRIBUTING.md  # Contribution guidelines
├── LICENSE         # License file
└── SECURITY.md     # Security policies
```

### Direct Download Contents
```
payware-mcp-server-v1.0.0/
├── dist/            # Ready-to-run distribution
├── examples/        # Partner-specific examples
├── docs/           # PDF documentation
└── QUICK-START.md  # Getting started guide
```

## Security and Licensing

### Security Considerations
1. **No Credentials in Distribution**:
   - `.env` files excluded via `.gitignore`
   - Private keys excluded via `.gitignore`
   - Clear instructions for generating own keys

2. **Secure Distribution Channels**:
   - NPM package signing
   - GitHub release verification
   - Checksums for direct downloads

3. **Regular Security Updates**:
   - Automated dependency scanning
   - CVE monitoring and patches
   - Security advisory communication

### Licensing Strategy
- **MIT License**: Permissive license encouraging adoption
- **Commercial Support**: Optional paid support for enterprise
- **Clear Usage Terms**: Define allowed and prohibited uses

## Partner Onboarding Process

### Technical Partners (NPM/GitHub)
1. **Self-Service Onboarding**:
   ```bash
   npm install @payware/mcp-server
   npm start
   ```
2. **Documentation**: Comprehensive online docs
3. **Support**: Community support via GitHub Issues
4. **Examples**: Code samples for common use cases

### Enterprise Partners (Direct Download)
1. **Guided Setup**: Dedicated support team
2. **Custom Configuration**: Partner-specific settings
3. **Integration Support**: Direct technical assistance
4. **SLA**: Service level agreements for support

### ISV Partners (All Methods)
1. **OAuth2 Setup**: Multi-merchant configuration
2. **Sandbox Environment**: Testing capabilities
3. **Certification Process**: Validate integration
4. **Go-Live Support**: Production deployment assistance

## Versioning and Updates

### Semantic Versioning
- **Major (X.0.0)**: Breaking changes, API modifications
- **Minor (0.X.0)**: New features, backward compatible
- **Patch (0.0.X)**: Bug fixes, security updates

### Update Strategy
1. **Automated Updates**: NPM package updates
2. **Migration Guides**: For breaking changes
3. **Deprecation Notices**: 6-month notice for deprecated features
4. **LTS Versions**: Long-term support for enterprise partners

## Success Metrics

### Adoption Metrics
- NPM package downloads per month
- GitHub repository stars and forks
- Partner portal download counts
- Active partner integrations

### Support Metrics
- GitHub issue response time
- Documentation page views
- Support ticket resolution time
- Partner satisfaction scores

### Quality Metrics
- Code coverage percentage
- Security vulnerability count
- Integration success rate
- API uptime percentage

## Support Strategy

### Community Support (Free)
- GitHub Issues for bug reports
- Community discussions
- Documentation and examples
- Public roadmap

### Premium Support (Paid)
- Dedicated support channels
- Priority response times
- Custom integration assistance
- Phone and video support

### Enterprise Support (Custom)
- Dedicated account management
- Custom SLAs
- On-site integration support
- Private support channels

## Marketing and Communication

### Launch Strategy
1. **Developer Portal**: Feature on payware developer site
2. **Documentation**: Comprehensive integration guides
3. **Blog Posts**: Technical articles and use cases
4. **Webinars**: Live integration demonstrations
5. **Conference Talks**: Present at fintech conferences

### Ongoing Communication
- **Release Notes**: Detailed changelog for updates
- **Developer Newsletter**: Monthly updates and tips
- **Social Media**: Share success stories and updates
- **Partner Spotlight**: Highlight successful integrations

## Risk Mitigation

### Technical Risks
- **Backward Compatibility**: Maintain API stability
- **Dependency Management**: Regular security updates
- **Performance Monitoring**: Track server performance
- **Error Handling**: Comprehensive error reporting

### Business Risks
- **License Compliance**: Monitor usage terms
- **Support Scaling**: Plan for increased support needs
- **Competition**: Monitor competitive landscape
- **Regulatory Changes**: Adapt to payment industry changes

## Conclusion

The recommended distribution strategy prioritizes NPM and GitHub for technical adoption while planning for enterprise and non-technical partners through direct download options. This multi-channel approach ensures maximum reach while maintaining appropriate support levels for different partner types.

The phased rollout allows for learning and iteration while building a robust ecosystem around the payware MCP server. Success depends on clear documentation, responsive support, and continuous improvement based on partner feedback.