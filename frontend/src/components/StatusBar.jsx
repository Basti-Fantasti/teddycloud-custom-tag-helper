import { useState } from 'react';
import { API_URL } from '../config/apiConfig';

export default function StatusBar({ status, onRefresh, onOpenSettings }) {
  const [reloading, setReloading] = useState(false);
  const [reloadStatus, setReloadStatus] = useState(null);

  if (!status) return null;

  const isHealthy = status.teddycloud_connected && status.library_api_connected && status.config_readable;

  const handleReloadTeddyCloud = async () => {
    setReloading(true);
    setReloadStatus(null);
    try {
      const response = await fetch(`${API_URL}/api/reload-teddycloud`, {
        method: 'POST'
      });
      const data = await response.json();
      setReloadStatus({ success: true, message: data.message });
      setTimeout(() => setReloadStatus(null), 3000);

      // Auto-refresh status after reload
      if (onRefresh) {
        setTimeout(() => onRefresh(), 1000);
      }
    } catch (error) {
      setReloadStatus({ success: false, message: 'Failed to reload TeddyCloud' });
      setTimeout(() => setReloadStatus(null), 3000);
    } finally {
      setReloading(false);
    }
  };

  return (
    <div
      className={`${
        isHealthy
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      } border-b py-2 sm:py-3 transition-colors`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mobile: Stacked layout */}
        <div className="flex flex-col space-y-2 sm:hidden">
          {/* Top row: Settings + Status indicators */}
          <div className="flex items-center space-x-3 overflow-x-auto">
            <button
              onClick={onOpenSettings}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors flex-shrink-0"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <StatusIndicator
              label="Cloud"
              connected={status.teddycloud_connected}
              compact={true}
            />
            <StatusIndicator
              label="API"
              connected={status.library_api_connected}
              compact={true}
            />
            <StatusIndicator
              label="Config"
              connected={status.config_readable}
              compact={true}
            />
          </div>

          {/* Bottom row: Reload button */}
          <button
            onClick={handleReloadTeddyCloud}
            disabled={reloading}
            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            title="Reload TeddyCloud configuration"
          >
            {reloading ? (
              <>
                <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Reloading...
              </>
            ) : (
              <>
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reload TeddyCloud
              </>
            )}
          </button>
          {reloadStatus && (
            <div className={`text-xs text-center ${reloadStatus.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {reloadStatus.message}
            </div>
          )}
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center space-x-6">
            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <StatusIndicator
              label="TeddyCloud"
              connected={status.teddycloud_connected}
            />
            <StatusIndicator
              label="Library API"
              connected={status.library_api_connected}
            />
            <StatusIndicator
              label="Config"
              connected={status.config_readable}
            />
          </div>
          <div className="flex items-center space-x-3">
          {reloadStatus && (
            <div className={`text-sm ${reloadStatus.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {reloadStatus.message}
            </div>
          )}
          <button
            onClick={handleReloadTeddyCloud}
            disabled={reloading}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            title="Reload TeddyCloud configuration"
          >
            {reloading ? (
              <>
                <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Reloading...
              </>
            ) : (
              <>
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reload TeddyCloud
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusIndicator({ label, connected, compact = false }) {
  return (
    <div className="flex items-center space-x-2 flex-shrink-0">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'
        }`}
      />
      <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300 whitespace-nowrap`}>{label}</span>
    </div>
  );
}
