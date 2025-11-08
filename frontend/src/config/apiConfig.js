/**
 * API Configuration
 * Provides dynamic API URL that works from any device
 */

/**
 * Get the API base URL
 * - If VITE_API_URL is set, use it (for development)
 * - Otherwise, use empty string (relative URLs for combined container)
 */
export const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Use relative URLs (empty string) - nginx on same origin proxies /api to backend
  // This ensures all API calls go through nginx proxy, not directly to TeddyCloud
  return '';
};

// Export as constant for convenience
export const API_URL = getApiUrl();
