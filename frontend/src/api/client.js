/**
 * API Client for Custom Tag Helper
 * Centralized axios client with all API endpoints
 */

import axios from 'axios';
import { getApiUrl } from '../config/apiConfig';

const API_BASE = getApiUrl();

const client = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for consistent error handling
client.interceptors.response.use(
  (response) => response,
  (error) => {
    // Extract error message from response
    const message = error.response?.data?.detail || error.message || 'Request failed';
    error.userMessage = message;
    return Promise.reject(error);
  },
);

// Tonies API
export const toniesAPI = {
  getAll: (skip = 0, limit = 50) => client.get('/tonies/', { params: { skip, limit } }),
  getOne: (no) => client.get(`/tonies/${no}`),
  create: (data) => client.post('/tonies/', data),
  update: (no, data) => client.put(`/tonies/${no}`, data),
  delete: (no) => client.delete(`/tonies/${no}`),
  preview: (data) => client.post('/tonies/preview', data),
};

// TAF Library API - TAF-centric view of all audio files
export const tafLibraryAPI = {
  getAll: (skip = 0, limit = 50, filter = 'all') => client.get('/taf-library/', { params: { skip, limit, filter } }),
};

// TAF Metadata API - metadata extraction and cover search
export const tafMetadataAPI = {
  parse: (tafFilename) => client.post('/taf-metadata/parse', null, {
    params: { taf_filename: tafFilename },
  }),
  searchCovers: (searchTerm, limit = 5) => client.post('/taf-metadata/search-covers', {
    search_term: searchTerm,
    limit,
  }),
  downloadCover: (imageUrl) => client.post('/taf-metadata/download-cover', {
    image_url: imageUrl,
  }),
};

// RFID Tags API - hardware tag management
export const rfidTagsAPI = {
  getAll: (skip = 0, limit = 50) => client.get('/rfid-tags/', { params: { skip, limit } }),
  getNextModelNumber: () => client.get('/rfid-tags/next-model-number'),
  getTonieboxes: () => client.get('/rfid-tags/tonieboxes'),
  linkTag: (tagUid, boxId, model, tafPath) => client.post('/rfid-tags/link', {
    tag_uid: tagUid,
    box_id: boxId,
    model,
    taf_path: tafPath,
  }),
  getBoxTags: (boxId) => client.get(`/rfid-tags/box/${boxId}`),
  getBoxLastRuid: (boxId) => client.get(`/rfid-tags/box/${boxId}/last-ruid`),
};

// Library API - file browsing
export const libraryAPI = {
  browse: (path = '') => client.get('/library/browse', { params: { path } }),
  parseTAF: (path) => client.post('/library/parse-taf', { path }),
};

// Uploads API
export const uploadsAPI = {
  uploadCover: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/uploads/cover', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  listCovers: () => client.get('/uploads/covers'),
};

// Images API - proxy for TeddyCloud images
export const imagesAPI = {
  getUrl: (path) => {
    // Return full URL for image (used in img src)
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${API_BASE}/api/images/${cleanPath}`;
  },
};

// System API
export const systemAPI = {
  getStatus: () => client.get('/status'),
  getConfig: () => client.get('/config'),
};

// Setup API
export const setupAPI = {
  checkStatus: () => client.get('/setup/status'),
  detectDataAccess: () => client.get('/setup/detect'),
  testTeddyCloud: (url) => client.post('/setup/test-teddycloud', { url }),
  saveConfiguration: (config) => client.post('/setup/save', config),
};

// Batch Processing API - bulk TAF processing
export const batchAPI = {
  /**
   * Analyze TAF files and match against tonies.json
   * @param {string[]} tafPaths - Array of TAF file paths
   * @returns {Promise} BatchAnalyzeResponse
   */
  analyze: (tafPaths) => client.post('/batch/analyze', { taf_paths: tafPaths }),

  /**
   * Search metadata for unmatched TAF files
   * @param {Array<{taf_path: string, series: string, episode: string}>} items
   * @returns {Promise} MetadataSearchResponse
   */
  searchMetadata: (items) => client.post('/batch/search-metadata', { items }),

  /**
   * Process confirmed selections and create tonie entries
   * @param {Array} selections - Array of BatchSelectionModel objects
   * @returns {Promise} BatchProcessResponse
   */
  process: (selections) => client.post('/batch/process', { selections }),

  /**
   * Get stats about the matching database
   * @returns {Promise} Stats object
   */
  getStats: () => client.get('/batch/stats'),
};

export default client;
