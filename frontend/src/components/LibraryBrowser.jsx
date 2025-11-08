import { useState, useEffect } from 'react';
import { libraryAPI } from '../api/client';

export default function LibraryBrowser({ onSelect, onCancel, parsing }) {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  const loadDirectory = async (path) => {
    setLoading(true);
    setError(null);

    try {
      const response = await libraryAPI.browse(path);
      setItems(response.data.items);
    } catch (err) {
      setError(`Failed to load directory: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item) => {
    if (item.is_directory) {
      setCurrentPath(item.path);
    } else if (item.is_taf) {
      onSelect(item.path);
    }
  };

  const handleBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Select TAF File from Library</h3>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700"
          disabled={parsing}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Path breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <span>Library</span>
        {currentPath && (
          <>
            <span>/</span>
            <span className="font-medium">{currentPath}</span>
          </>
        )}
      </div>

      {/* Back button */}
      {currentPath && (
        <button
          onClick={handleBack}
          className="flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back
        </button>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* File list */}
      {!loading && !error && (
        <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No files found</div>
          ) : (
            items.map((item, index) => (
              <button
                key={index}
                onClick={() => handleItemClick(item)}
                disabled={parsing}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left transition-colors disabled:opacity-50"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {/* Icon */}
                  {item.is_directory ? (
                    <svg
                      className="h-5 w-5 text-gray-400 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  ) : item.is_taf ? (
                    <svg
                      className="h-5 w-5 text-blue-500 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5 text-gray-400 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  )}

                  {/* Name */}
                  <span
                    className={`truncate ${
                      item.is_taf
                        ? 'font-medium text-gray-900'
                        : 'text-gray-700'
                    }`}
                  >
                    {item.name}
                  </span>
                </div>

                {/* Size */}
                {!item.is_directory && item.size && (
                  <span className="text-sm text-gray-500 ml-4">
                    {formatSize(item.size)}
                  </span>
                )}

                {/* Arrow for directories */}
                {item.is_directory && (
                  <svg
                    className="h-5 w-5 text-gray-400 ml-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">
        💡 Tip: Click on a .taf file to auto-parse its metadata
      </p>
    </div>
  );
}
