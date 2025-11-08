import { useContext } from 'react';
import { TAFLibraryContext } from '../context/TAFLibraryContext';

/**
 * Custom hook for accessing cached TAF library
 *
 * Usage:
 *   const { tafFiles, loading, error, refresh } = useTAFLibrary();
 *
 *   // Use cached TAF files
 *   tafFiles.forEach(taf => console.log(taf.filename));
 *
 *   // Force refresh if needed
 *   await refresh();
 */
export function useTAFLibrary() {
  const context = useContext(TAFLibraryContext);

  if (!context) {
    throw new Error('useTAFLibrary must be used within a TAFLibraryProvider');
  }

  return context;
}
