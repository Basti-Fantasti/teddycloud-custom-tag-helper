/**
 * API Client for Custom Tag Helper
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

// Tonies API
export const toniesAPI = {
  getAll: () => client.get('/tonies/'),
  getOne: (no) => client.get(`/tonies/${no}`),
  create: (data) => client.post('/tonies/', data),
  update: (no, data) => client.put(`/tonies/${no}`, data),
  delete: (no) => client.delete(`/tonies/${no}`),
};

// Library API
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

export default client;
