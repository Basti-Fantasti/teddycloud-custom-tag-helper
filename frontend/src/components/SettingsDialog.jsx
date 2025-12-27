import { useState, useEffect } from 'react';
import { API_URL } from '../config/apiConfig';
import { useTranslation } from '../hooks/useTranslation';

export default function SettingsDialog({ isOpen, onClose, onConfigChange }) {
  const { t, language, setLanguage } = useTranslation();
  const [config, setConfig] = useState({
    teddycloud: { url: '', timeout: 30 },
    app: { auto_parse_taf: true, default_language: 'de-de', selected_box: null }
  });
  const [initialConfig, setInitialConfig] = useState(null);
  const [envSources, setEnvSources] = useState([]);  // Keys set via environment variables
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [error, setError] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);

  // Helper to check if a config key is set via environment variable
  const isEnvSourced = (key) => envSources.includes(key);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      loadBoxes();
      setTestSuccessful(false);
      setTestResults(null);
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/api/config`);
      const data = await response.json();
      // Extract env sources and remove from config object
      const sources = data._env_sources || [];
      delete data._env_sources;
      setEnvSources(sources);
      setConfig(data);
      setInitialConfig(JSON.parse(JSON.stringify(data))); // Deep copy for comparison
      setError(null);
    } catch (err) {
      setError(`Failed to load configuration: ${err.message}`);
    }
  };

  const loadBoxes = async () => {
    try {
      setLoadingBoxes(true);
      const response = await fetch(`${API_URL}/api/rfid-tags/tonieboxes`);
      const data = await response.json();
      setBoxes(data.boxes || []);
    } catch (err) {
      console.error('Failed to load Tonieboxes:', err);
    } finally {
      setLoadingBoxes(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResults(null);
    setTestSuccessful(false);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const results = await response.json();
      setTestResults(results);

      // Check if test passed
      const teddycloudOk = results.teddycloud.status === 'success';
      setTestSuccessful(teddycloudOk);
    } catch (err) {
      setError(`Connection test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Save configuration
      const saveResponse = await fetch(`${API_URL}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save configuration');
      }

      // Check if backend settings changed (requires restart)
      const backendSettingsChanged = initialConfig && (
        config.teddycloud.url !== initialConfig.teddycloud.url ||
        config.teddycloud.timeout !== initialConfig.teddycloud.timeout
      );

      if (backendSettingsChanged) {
        // Restart backend
        try {
          await fetch(`${API_URL}/api/restart`, { method: 'POST', signal: AbortSignal.timeout(2000) });
        } catch (restartErr) {
          // Restart endpoint will close the connection, so this is expected
          console.log('Backend is restarting...');
        }

        // Close dialog and show success message
        alert('Settings saved! Backend is restarting...');
        onClose();

        // Reload page after a short delay to reconnect to restarted backend
        setTimeout(() => window.location.reload(), 3000);
      } else {
        // Only app settings changed - no restart needed
        // Notify parent component of config changes
        if (onConfigChange) {
          onConfigChange({
            selectedBox: config.app.selected_box,
            defaultLanguage: config.app.default_language
          });
        }
        onClose();
      }
    } catch (err) {
      setError(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* TeddyCloud Connection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('settings.teddycloud.title')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.teddycloud.serverUrl')}
                  {isEnvSourced('teddycloud.url') && <EnvBadge />}
                </label>
                <input
                  type="text"
                  value={config.teddycloud.url}
                  onChange={(e) => setConfig({ ...config, teddycloud: { ...config.teddycloud, url: e.target.value } })}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                    isEnvSourced('teddycloud.url')
                      ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-gray-900 dark:text-white'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                  placeholder="http://docker"
                />
                {isEnvSourced('teddycloud.url') && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {t('settings.envVarInfo', { var: 'TEDDYCLOUD_URL' })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Application Settings */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('settings.app.title')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.app.activeBoxTitle')}
                </label>
                <select
                  value={config.app.selected_box || ''}
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, selected_box: e.target.value || null } })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  disabled={loadingBoxes}
                >
                  <option value="">{t('settings.app.noBoxSelected')}</option>
                  {boxes.map(box => (
                    <option key={box.id} value={box.id}>{box.name} ({box.id})</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('settings.app.activeBoxHelp')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.app.defaultLanguageTitle')}
                </label>
                <select
                  value={config.app.default_language}
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, default_language: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <option value="de-de">German (de-de)</option>
                  <option value="en-us">English (en-us)</option>
                  <option value="fr-fr">French (fr-fr)</option>
                  <option value="es-es">Spanish (es-es)</option>
                  <option value="it-it">Italian (it-it)</option>
                  <option value="nl-nl">Dutch (nl-nl)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('settings.app.defaultLanguageHelp')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.app.uiLanguageTitle')}
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <option value="en">{t('settings.languages.en')}</option>
                  <option value="de">{t('settings.languages.de')}</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('settings.app.uiLanguageHelp')}
                </p>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.app.auto_parse_taf}
                    onChange={(e) => setConfig({ ...config, app: { ...config.app, auto_parse_taf: e.target.checked } })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.app.autoParseTitle')}</span>
                </label>
                <p className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">
                  {t('settings.app.autoParseHelp')}
                </p>
              </div>
            </div>
          </div>

          {/* Test Connection Button */}
          <div>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {testing ? t('settings.testing') : t('settings.testConnection')}
            </button>
          </div>

          {/* Test Results */}
          {testResults && (
            <div className="space-y-2">
              <TestResult label="TeddyCloud" result={testResults.teddycloud} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {t('settings.discard')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t('settings.saving') : t('settings.saveAndRestart')}
          </button>
        </div>
      </div>
    </div>
  );
}

function EnvBadge() {
  return (
    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      ENV
    </span>
  );
}

function TestResult({ label, result }) {
  const statusColors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    disabled: 'bg-gray-50 border-gray-200 text-gray-600',
    unknown: 'bg-gray-50 border-gray-200 text-gray-600'
  };

  const statusIcons = {
    success: '✓',
    error: '✗',
    disabled: '○',
    unknown: '?'
  };

  return (
    <div className={`p-3 border rounded ${statusColors[result.status]}`}>
      <div className="flex items-center space-x-2">
        <span className="text-lg font-bold">{statusIcons[result.status]}</span>
        <div className="flex-1">
          <div className="font-medium">{label}</div>
          <div className="text-sm">{result.message}</div>
        </div>
      </div>
    </div>
  );
}
