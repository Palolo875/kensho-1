/**
 * JSON parsing utilities with error handling
 */

export function parseJSON<T = any>(json: string, defaultValue?: T): T | null {
  try {
    return JSON.parse(json);
  } catch (e) {
    return defaultValue || null;
  }
}

export function safeJSONParse<T = any>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json);
  } catch (e) {
    return defaultValue;
  }
}
