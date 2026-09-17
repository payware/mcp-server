/**
 * JSON Consistency Utilities for payware API
 *
 * CORE REQUIREMENT: The exact same compact JSON string must be used for
 * both JWT contentSha256 calculation and HTTP request body to prevent hash mismatches.
 *
 * SOLUTION: We use deterministic serialization (sorted keys) to guarantee
 * consistent JSON output regardless of object property insertion order.
 *
 * This prevents subtle bugs where the same object could produce different
 * JSON strings across different JavaScript environments or property orderings.
 */

/**
 * Create consistent compact JSON string for payware API requests
 *
 * CORE REQUIREMENT: payware API requires that the exact same compact JSON string
 * is used for both JWT contentSha256 calculation and the HTTP request body.
 *
 * SOLUTION: This function uses deterministic serialization with sorted keys
 * to guarantee the same output every time, preventing hash mismatch errors.
 *
 * @param {Object} obj - Object to serialize
 * @returns {string} Compact JSON string with sorted keys (no whitespace)
 */
export function createDeterministicJSON(obj) {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  
  // Sort object keys recursively to ensure deterministic output
  const sortedObj = sortObjectKeys(obj);
  
  // Use JSON.stringify with no formatting (minimized)
  return JSON.stringify(sortedObj);
}

/**
 * Recursively sort object keys to ensure deterministic ordering
 * @param {any} obj - Object to sort
 * @returns {any} Object with sorted keys
 */
function sortObjectKeys(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sortObjectKeys(item));
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  const sorted = {};
  const keys = Object.keys(obj).sort();
  
  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  
  return sorted;
}

/**
 * Create compact JSON for payware API requests (alias for consistency)
 *
 * payware REQUIRES:
 * 1. JSON must be compact (no extra whitespace)
 * 2. The EXACT same string must be used for JWT contentSha256 and HTTP body
 *
 * This function ensures both requirements by using deterministic serialization.
 *
 * @param {Object} requestBody - Request body object
 * @returns {string} Compact JSON string with sorted keys
 */
export function createMinimizedJSON(requestBody) {
  return createDeterministicJSON(requestBody);
}

/**
 * Validate that two objects produce the same JSON string
 *
 * This is crucial for payware API because the JWT contentSha256 and HTTP body
 * must use the exact same string. This function helps test that requirement.
 *
 * @param {Object} obj1 - First object
 * @param {Object} obj2 - Second object
 * @returns {boolean} True if both objects produce identical JSON strings
 */
export function validateJSONConsistency(obj1, obj2) {
  const json1 = createDeterministicJSON(obj1);
  const json2 = createDeterministicJSON(obj2);
  return json1 === json2;
}