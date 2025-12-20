/**
 * JSON formatter utility for deterministic serialization
 * Helps developers format JSON correctly for payware API requests
 */

import { createDeterministicJSON, validateJSONConsistency } from '../core/utils/json-serializer.js';
import { generateContentMd5 } from '../core/auth/jwt-token.js';

/**
 * Format JSON with deterministic serialization tool
 */
export const formatJSONDeterministicTool = {
  name: "payware_utils_format_json_deterministic",
  description: "Format JSON payload with deterministic key sorting for consistent MD5 calculation and payware API compliance",
  inputSchema: {
    type: "object",
    properties: {
      payload: {
        type: "object",
        description: "JSON payload to format with deterministic serialization"
      },
      showComparison: {
        type: "boolean",
        description: "Show comparison between standard and deterministic JSON",
        default: true
      },
      calculateMD5: {
        type: "boolean",
        description: "Calculate MD5 hash for JWT contentMd5 usage",
        default: true
      },
      validateConsistency: {
        type: "boolean",
        description: "Validate that multiple serializations produce the same result",
        default: false
      }
    },
    required: ["payload"],
    additionalProperties: false
  },

  async handler(args) {
    const {
      payload,
      showComparison = true,
      calculateMD5 = true,
      validateConsistency = false
    } = args;

    if (!payload || typeof payload !== 'object') {
      throw new Error("Payload must be a valid JSON object");
    }

    try {
      // Generate different serializations
      const standardJson = JSON.stringify(payload);
      const prettyJson = JSON.stringify(payload, null, 2);
      const deterministicJson = createDeterministicJSON(payload);

      // Calculate MD5 hash
      const md5Hash = calculateMD5 ? generateContentMd5(payload) : null;

      // Get key ordering information
      const originalKeys = Object.keys(payload);
      const sortedKeys = [...originalKeys].sort();
      const isAlreadySorted = JSON.stringify(originalKeys) === JSON.stringify(sortedKeys);

      // Consistency validation
      let consistencyTest = null;
      if (validateConsistency) {
        // Create multiple instances and test consistency
        const testPayload1 = { ...payload };
        const testPayload2 = JSON.parse(JSON.stringify(payload));
        const testPayload3 = Object.assign({}, payload);

        consistencyTest = {
          test1: createDeterministicJSON(testPayload1),
          test2: createDeterministicJSON(testPayload2),
          test3: createDeterministicJSON(testPayload3),
          allMatch: validateJSONConsistency(testPayload1, testPayload2) &&
                   validateJSONConsistency(testPayload2, testPayload3)
        };
      }

      return {
        content: [{
          type: "text",
          text: `📋 **JSON Deterministic Formatter**

## Input Payload Analysis

**Original Key Order**: [${originalKeys.join(', ')}]
**Sorted Key Order**: [${sortedKeys.join(', ')}]
**Already Sorted**: ${isAlreadySorted ? '✅ Yes' : '❌ No (will be reordered)'}

${showComparison ? `## JSON Serialization Comparison

**❌ Standard JSON.stringify()** (property order varies):
\`\`\`json
${standardJson}
\`\`\`

**📖 Pretty JSON** (formatted but inconsistent order):
\`\`\`json
${prettyJson}
\`\`\`

**✅ Deterministic JSON** (sorted keys, consistent):
\`\`\`json
${deterministicJson}
\`\`\`

### Key Differences:
${isAlreadySorted ?
  '- ✅ Your object keys are already in sorted order' :
  `- ❌ Keys will be reordered: ${originalKeys.join(' → ')} becomes ${sortedKeys.join(' → ')}`}
- ✅ Deterministic JSON ensures consistent serialization across platforms
- ✅ Required for accurate MD5 hash calculation in JWT tokens
` : ''}

## ✅ **payware API Ready JSON**

Use this exact JSON string for both JWT MD5 calculation and HTTP request body:

\`\`\`json
${deterministicJson}
\`\`\`

${calculateMD5 ? `## 🔒 **MD5 Hash for JWT**

**contentMd5**: \`${md5Hash}\`

**Usage in JWT Header**:
\`\`\`json
{
  "alg": "RS256",
  "typ": "JWT",
  "contentMd5": "${md5Hash}"
}
\`\`\`
` : ''}

## 🛠 **Implementation Guide**

### Python Implementation:
\`\`\`python
import json

# CORRECT: Use deterministic JSON
json_body = json.dumps(payload, sort_keys=True, separators=(',', ':'))
jwt_token = create_jwt_token(json_body)
response = requests.post(url, data=json_body, headers=headers)
\`\`\`

### Node.js Implementation:
\`\`\`javascript
// Helper function for deterministic JSON
function createDeterministicJSON(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// CORRECT: Use deterministic JSON
const jsonBody = createDeterministicJSON(payload);
const jwtToken = createJWTToken(jsonBody);
const response = await axios.post(url, jsonBody, {headers});
\`\`\`

### PHP Implementation:
\`\`\`php
// CORRECT: Use deterministic JSON
function createDeterministicJSON($obj) {
    ksort($obj);
    return json_encode($obj, JSON_UNESCAPED_SLASHES);
}

$jsonBody = createDeterministicJSON($payload);
$jwtToken = createJWTToken($jsonBody);
// Use $jsonBody for both JWT and cURL request
\`\`\`

${consistencyTest ? `## 🧪 **Consistency Validation**

**Test Results**:
- Test 1: \`${consistencyTest.test1}\`
- Test 2: \`${consistencyTest.test2}\`
- Test 3: \`${consistencyTest.test3}\`

**All Match**: ${consistencyTest.allMatch ? '✅ Consistent' : '❌ Inconsistent'}

${!consistencyTest.allMatch ? '⚠️ **Warning**: Inconsistent serialization detected. This could cause MD5 mismatches.' : ''}
` : ''}

## ⚠️ **PAYWARE Critical Requirements**

1. **Same String Requirement**: The EXACT same compact JSON string must be used for both JWT contentMd5 and HTTP request body
2. **Compact Format**: No extra whitespace (spaces, newlines) in JSON
3. **Consistent Serialization**: Use deterministic serialization to prevent variations
4. **MD5 Consistency**: Any difference will cause ERR_INVALID_MD5 authentication failures

Note: Sorted keys are our METHOD to guarantee requirement #1, not a payware requirement itself.

## 🔗 **Next Steps**

1. Use the deterministic JSON above in your API request
2. Include the MD5 hash in your JWT header${calculateMD5 ? ` (\`${md5Hash}\`)` : ''}
3. Send the exact same JSON string in your HTTP request body
4. Verify with \`payware_authentication_validate_jwt\` tool

---
**Execution Info:**
- Tool: payware_utils_format_json_deterministic
- Keys Processed: ${originalKeys.length}
- Sorting Required: ${!isAlreadySorted}
- MD5 Calculated: ${calculateMD5}
- Executed: ${new Date().toISOString()}
- Status: ✅ Complete`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **JSON Formatting Failed**

**Error**: ${error.message}

**Common Issues**:
- Invalid JSON structure
- Circular references in payload
- Non-serializable values (functions, undefined, etc.)
- Different JSON strings used for JWT MD5 vs HTTP body

**Debug Steps for MD5 Errors**:
1. Verify the SAME string is used for JWT contentMd5 and HTTP body
2. Check for extra whitespace or formatting differences
3. Ensure consistent property ordering (use deterministic serialization)
4. Validate that objects are properly serializable
5. Test with the consistency validation option

---
**Execution Info:**
- Tool: payware_utils_format_json_deterministic
- Executed: ${new Date().toISOString()}
- Status: ❌ Error`
        }]
      };
    }
  }
};