import { API_URL } from '../config/apiConfig';
import { useTAFLibrary } from '../hooks/useTAFLibrary';
import { useTranslation } from '../hooks/useTranslation';
import Pagination from './Pagination';
import BatchSelectionToolbar from './BatchSelectionToolbar';

export default function TAFLibrary({ onCreateTonie, onBatchProcess }) {
  const { t } = useTranslation();
  const {
    tafFiles,
    stats,
    loading,
    error,
    refresh,
    page,
    pageSize,
    totalCount,
    hasNext,
    hasPrev,
    goToPage,
    changePageSize,
    filter,
    setFilter,
    // Batch selection
    toggleSelection,
    isSelected,
    selectedCount,
  } = useTAFLibrary();

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTotalDuration = (trackSeconds) => {
    if (!trackSeconds || trackSeconds.length === 0) return null;
    const total = trackSeconds[trackSeconds.length - 1];
    return formatDuration(total);
  };

  // Files are already filtered server-side, no client-side filtering needed

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-start">
          <svg className="w-6 h-6 text-red-600 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 mb-2">{t('taf.connectionError')}</h3>
            <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
            <button
              onClick={refresh}
              className="mt-4 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              {t('taf.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition-colors">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('taf.statistics.total')}</div>
          <div className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition-colors">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('taf.statistics.linked')}</div>
          <div className="mt-1 text-3xl font-semibold text-green-600 dark:text-green-400">{stats.linked}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition-colors">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('taf.statistics.orphaned')}</div>
          <div className="mt-1 text-3xl font-semibold text-orange-600 dark:text-orange-400">{stats.orphaned}</div>
        </div>
      </div>

      {/* Batch Selection Toolbar */}
      <BatchSelectionToolbar onBatchProcess={onBatchProcess} />

      {/* Filter Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow transition-colors">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setFilter('all')}
              className={`${
                filter === 'all'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              {t('taf.filters.all')} ({stats.total})
            </button>
            <button
              onClick={() => setFilter('linked')}
              className={`${
                filter === 'linked'
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              {t('taf.filters.linked')} ({stats.linked})
            </button>
            <button
              onClick={() => setFilter('orphaned')}
              className={`${
                filter === 'orphaned'
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              {t('taf.filters.orphaned')} ({stats.orphaned})
            </button>
          </nav>
        </div>

        {/* TAF Files List - Split View Layout */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {tafFiles.map((file, idx) => (
            <div
              key={idx}
              className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {/* Split view: Left = TAF info, Right = Linked tonie */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-gray-200 dark:divide-gray-700">
                {/* Left Half: TAF File Info */}
                <div className="px-4 py-3 flex items-start gap-3">
                  {/* Checkbox for unlinked files */}
                  {!file.is_linked && (
                    <div className="flex-shrink-0 flex items-center h-8">
                      <input
                        type="checkbox"
                        checked={isSelected(file.path)}
                        onChange={() => toggleSelection(file.path)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                        aria-label={t('batch.selectFile')}
                      />
                    </div>
                  )}
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {file.is_linked ? (
                      <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* File Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {file.name.includes('/') ? (
                        <>
                          <span className="text-gray-400 dark:text-gray-500 font-normal text-xs">
                            {file.name.split('/').slice(0, -1).join('/') + '/'}
                          </span>
                          <span className="block mt-0.5">{file.name.split('/').pop()}</span>
                        </>
                      ) : (
                        file.name
                      )}
                    </h3>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          {formatFileSize(file.size)}
                        </span>
                        {file.track_count !== null && file.track_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                            {file.track_count} {t('taf.tracks')}
                          </span>
                        )}
                        {file.track_seconds && (
                          <span className="inline-flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {getTotalDuration(file.track_seconds)}
                          </span>
                        )}
                      </div>
                      {file.audio_id && (
                        <div className="text-xs text-gray-500 font-mono">
                          Audio ID: {file.audio_id}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Half: Linked Tonie or Action */}
                <div className="px-4 py-3 flex items-center justify-center md:justify-start">
                  {file.linked_tonie ? (
                    <div className="flex items-center gap-3 w-full">
                      {/* Tonie Cover */}
                      {file.linked_tonie.pic && (
                        <img
                          src={
                            file.linked_tonie.pic.startsWith('http://') || file.linked_tonie.pic.startsWith('https://')
                              ? file.linked_tonie.pic
                              : `${API_URL}/api/images/${file.linked_tonie.pic.startsWith('/') ? file.linked_tonie.pic.substring(1) : file.linked_tonie.pic}`
                          }
                          alt={file.linked_tonie.series}
                          className="w-16 h-16 rounded-lg object-cover shadow-sm flex-shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                      {/* Tonie Details */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {file.linked_tonie.series}
                        </div>
                        {file.linked_tonie.episodes && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                            {file.linked_tonie.episodes}
                          </div>
                        )}
                        <div className="mt-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            file.linked_tonie.category === 'custom'
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                              : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          }`}>
                            {file.linked_tonie.category === 'custom' ? t('taf.category.custom') : t('taf.category.official')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onCreateTonie && onCreateTonie(file)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                      <svg className="-ml-0.5 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {t('taf.createTonie')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {tafFiles.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500">
              {t('taf.noFilesFound')}
              {filter !== 'all' && ` ${t('rfid.inCategory')} "${t(`taf.filters.${filter}`)}"`}.
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onPageChange={goToPage}
            onPageSizeChange={changePageSize}
          />
        )}
      </div>
    </div>
  );
}
