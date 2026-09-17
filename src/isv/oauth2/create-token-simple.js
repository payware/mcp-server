/**
 * Simple OAuth2 token creation utility for testing
 * Returns just the token string for easy command-line use
 */

import { obtainTokenTool } from './obtain-token.js';

/**
 * Create OAuth2 token and return just the token string
 * @param {Object} params - Optional parameters (uses env vars if not provided)
 * @returns {string} The access token
 */
export async function createTokenSimple(params = {}) {
  try {
    const result = await obtainTokenTool.handler(params);

    // Extract token from the response text
    const responseText = result.content?.[0]?.text || '';
    const tokenMatch = responseText.match(/🎯 \*\*NEW ACCESS TOKEN\*\*: ([A-Za-z0-9]+)/);
    if (tokenMatch) {
      return tokenMatch[1];
    }

    // Fallback: look for any token pattern in the response
    const fallbackMatch = responseText.match(/Access Token\*\*: ([A-Za-z0-9]+)/);
    if (fallbackMatch) {
      return fallbackMatch[1];
    }

    throw new Error('Could not extract token from response');
  } catch (error) {
    throw new Error(`Token creation failed: ${error.message}`);
  }
}

// For command line testing
if (import.meta.url === `file://${process.argv[1]}`) {
  createTokenSimple()
    .then(token => {
      console.log('🎯 New OAuth2 Token:');
      console.log(token);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
    });
}