import { createContext, useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config/apiConfig';

export const TAFLibraryContext = createContext();

export function TAFLibraryProvider({ children }) {
  const [tafFiles, setTafFiles] = useState([]);
  const [stats, setStats] = useState({ total: 0, linked: 0, orphaned: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadTafFiles = useCallback(async (force = false) => {
    // Skip if already loaded and not forcing refresh
    if (tafFiles.length > 0 && !force && lastUpdated) {
      console.log('Using cached TAF files');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Fetching TAF library from API...');
      const response = await fetch(`${API_URL}/api/taf-library/`);

      if (!response.ok) {
        throw new Error(`Failed to load TAF library: ${response.statusText}`);
      }

      const data = await response.json();
      setTafFiles(data.taf_files || []);
      setStats({
        total: data.total_count || 0,
        linked: data.linked_count || 0,
        orphaned: data.orphaned_count || 0
      });
      setLastUpdated(Date.now());
      console.log(`Loaded ${data.taf_files?.length || 0} TAF files`);
    } catch (err) {
      console.error('Failed to load TAF files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tafFiles.length, lastUpdated]);

  // Load on mount
  useEffect(() => {
    loadTafFiles();
  }, []);

  const refresh = useCallback(() => {
    console.log('Forcing TAF library refresh...');
    return loadTafFiles(true);
  }, [loadTafFiles]);

  return (
    <TAFLibraryContext.Provider value={{
      tafFiles,
      stats,
      loading,
      error,
      refresh,
      lastUpdated
    }}>
      {children}
    </TAFLibraryContext.Provider>
  );
}
