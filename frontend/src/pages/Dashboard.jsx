import { useState, useEffect } from 'react';
import { toniesAPI, systemAPI } from '../api/client';
import TonieGrid from '../components/TonieGrid';
import TAFLibrary from '../components/TAFLibrary';
import RFIDTagsView from '../components/RFIDTagsView';
import TonieEditor from '../components/TonieEditor';
import StatusBar from '../components/StatusBar';
import SettingsDialog from '../components/SettingsDialog';
import TagSetupDialog from '../components/TagSetupDialog';
import TagStatusField from '../components/TagStatusField';
import { API_URL } from '../config/apiConfig';
import { useTranslation } from '../hooks/useTranslation';
import { useTAFLibrary } from '../hooks/useTAFLibrary';

const DEFAULT_PAGE_SIZE = 50;

export default function Dashboard() {
  const { t } = useTranslation();
  const { refresh: refreshTAFLibrary } = useTAFLibrary();
  const [tonies, setTonies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tonies pagination state
  const [toniesPage, setToniesPage] = useState(1);
  const [toniesPageSize, setToniesPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [toniesTotalCount, setToniesTotalCount] = useState(0);
  const [toniesHasNext, setToniesHasNext] = useState(false);
  const [toniesHasPrev, setToniesHasPrev] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTonie, setEditingTonie] = useState(null);
  const [selectedTafFile, setSelectedTafFile] = useState(null);
  const [status, setStatus] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTagSetup, setShowTagSetup] = useState(false);
  const [setupTag, setSetupTag] = useState(null);
  const [rfidTags, setRfidTags] = useState([]);
  const [viewMode, setViewMode] = useState('taf'); // 'taf', 'tonies', or 'rfid'
  const [selectedBox, setSelectedBox] = useState(null);
  const [defaultLanguage, setDefaultLanguage] = useState('en-us');
  const [darkMode, setDarkMode] = useState(() => {
    // Initialize from localStorage or system preference
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Apply dark mode class to document
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Save preference
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    loadTonies();
    loadStatus();
    loadConfig();
    loadRfidTags();

    // Poll status and RFID tags every 10 seconds
    const statusInterval = setInterval(() => {
      loadStatus();
      loadRfidTags();
    }, 10000);

    return () => clearInterval(statusInterval);
  }, []);

  const loadTonies = async (page = toniesPage, pageSize = toniesPageSize) => {
    try {
      setLoading(true);
      const skip = (page - 1) * pageSize;
      const response = await toniesAPI.getAll(skip, pageSize);
      const data = response.data;

      setTonies(data.items || []);
      setToniesTotalCount(data.total_count || 0);
      setToniesPage(data.page || 1);
      setToniesPageSize(data.page_size || DEFAULT_PAGE_SIZE);
      setToniesHasNext(data.has_next || false);
      setToniesHasPrev(data.has_prev || false);
      setError(null);
    } catch (err) {
      setError(`Failed to load tonies: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToniesPageChange = (newPage) => {
    setToniesPage(newPage);
    loadTonies(newPage, toniesPageSize);
  };

  const handleToniesPageSizeChange = (newPageSize) => {
    setToniesPageSize(newPageSize);
    setToniesPage(1);
    loadTonies(1, newPageSize);
  };

  const loadStatus = async () => {
    try {
      const response = await systemAPI.getStatus();
      setStatus(response.data);
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const loadConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/api/config`);
      const data = await response.json();
      setSelectedBox(data.app.selected_box);
      if (data.app.default_language) {
        setDefaultLanguage(data.app.default_language);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const loadRfidTags = async () => {
    try {
      const response = await fetch(`${API_URL}/api/rfid-tags`);
      const data = await response.json();
      setRfidTags(data.tags || []);
    } catch (err) {
      console.error('Failed to load RFID tags:', err);
    }
  };

  const handleCreateNew = () => {
    setEditingTonie(null);
    setSelectedTafFile(null);
    setShowEditor(true);
  };

  const handleCreateFromTaf = (tafFile) => {
    setEditingTonie(null);
    setSelectedTafFile(tafFile);
    setShowEditor(true);
  };

  const handleEdit = (tonie) => {
    setEditingTonie(tonie);
    setShowEditor(true);
  };

  const handleDelete = async (tonie) => {
    if (!confirm(`Delete tonie "${tonie.series}"?`)) return;

    try {
      await toniesAPI.delete(tonie.no);
      await loadTonies();
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const handleSave = async () => {
    setShowEditor(false);
    await loadTonies();
    await refreshTAFLibrary();
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingTonie(null);
    setSelectedTafFile(null);
  };

  const handleTagSetupSuccess = async () => {
    await loadTonies();
    await loadRfidTags();
    await refreshTAFLibrary();
  };

  const handleSetupTag = (tag) => {
    setSetupTag(tag);
    setShowTagSetup(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow transition-colors">
        <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            {/* Top Row: Title and Dark Mode Toggle */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  {t('app.title')}
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Manage your TeddyCloud custom tonies
                </p>
              </div>
              {/* Dark Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Bottom Row: View Mode Toggle and Add Button */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-full sm:w-auto">
                <button
                  onClick={() => setViewMode('taf')}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'taf'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t('navigation.tafFiles')}
                </button>
                <button
                  onClick={() => setViewMode('tonies')}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'tonies'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t('navigation.customTonies')}
                </button>
                <button
                  onClick={() => setViewMode('rfid')}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'rfid'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t('navigation.rfidTags')}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                {/* Tag Status Field */}
                <TagStatusField
                  selectedBox={selectedBox}
                  onSetupTag={handleSetupTag}
                />

                {/* Add Custom Tonie Button */}
                <button
                  onClick={handleCreateNew}
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors w-full sm:w-auto"
                >
                  <svg
                    className="-ml-1 mr-2 h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t('buttons.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Status Bar */}
      <StatusBar status={status} onRefresh={loadStatus} onOpenSettings={() => setShowSettings(true)} />

      {/* Settings Dialog */}
      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Tag Setup Dialog */}
      <TagSetupDialog
        isOpen={showTagSetup}
        onClose={() => setShowTagSetup(false)}
        availableTag={setupTag}
        onSuccess={handleTagSetupSuccess}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {!loading && !error && !showEditor && viewMode === 'taf' && (
          <TAFLibrary onCreateTonie={handleCreateFromTaf} />
        )}

        {!loading && !error && !showEditor && viewMode === 'tonies' && (
          <TonieGrid
            tonies={tonies}
            onEdit={handleEdit}
            onDelete={handleDelete}
            page={toniesPage}
            pageSize={toniesPageSize}
            totalCount={toniesTotalCount}
            hasNext={toniesHasNext}
            hasPrev={toniesHasPrev}
            onPageChange={handleToniesPageChange}
            onPageSizeChange={handleToniesPageSizeChange}
          />
        )}

        {!loading && !error && !showEditor && viewMode === 'rfid' && (
          <RFIDTagsView onAssignTag={handleSetupTag} />
        )}

        {showEditor && (
          <TonieEditor
            tonie={editingTonie}
            tafFile={selectedTafFile}
            defaultLanguage={defaultLanguage}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </main>
    </div>
  );
}
