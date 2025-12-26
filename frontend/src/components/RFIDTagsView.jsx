import { useState, useEffect } from 'react';
import { API_URL } from '../config/apiConfig';
import { useTranslation } from '../hooks/useTranslation';

export default function RFIDTagsView({ onAssignTag }) {
  const { t } = useTranslation();
  const [tags, setTags] = useState([]);
  const [stats, setStats] = useState({ total: 0, unconfigured: 0, assigned: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'assigned', 'unconfigured'

  useEffect(() => {
    loadRFIDTags();
  }, []);

  const loadRFIDTags = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/rfid-tags/`);
      if (!response.ok) throw new Error('Failed to load RFID tags');

      const data = await response.json();

      // Filter out system sound tags (box-de-de-01-*)
      const filteredTags = data.tags.filter(tag => {
        const model = tag.model || '';
        return !model.startsWith('box-de-de-01-');
      });

      // Recalculate stats without system sounds
      const assigned = filteredTags.filter(t => t.status === 'assigned').length;
      const unconfigured = filteredTags.filter(t => t.status === 'unconfigured').length;

      setTags(filteredTags);
      setStats({
        total: filteredTags.length,
        unconfigured: unconfigured,
        assigned: assigned
      });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      assigned: 'bg-green-100 text-green-800',
      unconfigured: 'bg-orange-100 text-orange-800'
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[status]}`}>
        {t(`rfid.status.${status}`)}
      </span>
    );
  };

  const getTAFFileName = (source) => {
    if (!source) return null;
    // Extract filename from "lib://path/to/file.taf"
    if (source.startsWith('lib://')) {
      return source.substring(6); // Remove "lib://"
    }
    return source;
  };

  const filteredTags = tags.filter(tag => {
    if (filter === 'assigned') return tag.status === 'assigned';
    if (filter === 'unconfigured') return tag.status === 'unconfigured';
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition-colors">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('rfid.statistics.total')}</div>
          <div className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition-colors">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('rfid.statistics.assigned')}</div>
          <div className="mt-1 text-3xl font-semibold text-green-600 dark:text-green-400">{stats.assigned}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition-colors">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('rfid.statistics.unconfigured')}</div>
          <div className="mt-1 text-3xl font-semibold text-orange-600 dark:text-orange-400">{stats.unconfigured}</div>
        </div>
      </div>

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
              {t('rfid.filters.all')} ({stats.total})
            </button>
            <button
              onClick={() => setFilter('assigned')}
              className={`${
                filter === 'assigned'
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              {t('rfid.filters.assigned')} ({stats.assigned})
            </button>
            <button
              onClick={() => setFilter('unconfigured')}
              className={`${
                filter === 'unconfigured'
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              {t('rfid.filters.unconfigured')} ({stats.unconfigured})
            </button>
          </nav>
        </div>

        {/* RFID Tags List - Horizontal columns on desktop, rows on mobile */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {filteredTags.map((tag, idx) => (
            <div
              key={idx}
              className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {/* Horizontal layout on md+ screens, vertical on small screens */}
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                {/* Column 1: TAG ID & Status */}
                <div className="flex items-center gap-3 md:w-64 flex-shrink-0">
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {tag.status === 'assigned' ? (
                      <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* TAG ID */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white font-mono truncate">
                      {tag.uid}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {tag.model}
                    </div>
                  </div>
                </div>

                {/* Divider - vertical on desktop, horizontal on mobile */}
                <div className="hidden md:block w-px h-12 bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>

                {/* Column 2: TAF File */}
                <div className="flex-1 min-w-0">
                  {tag.source ? (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-900 dark:text-white font-mono truncate">
                          {getTAFFileName(tag.source)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 dark:text-gray-600 italic">{t('rfid.noTafFile')}</div>
                  )}
                </div>

                {/* Divider - vertical on desktop, horizontal on mobile */}
                <div className="hidden md:block w-px h-12 bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>

                {/* Column 3: Linked Tonie */}
                <div className="flex-1 min-w-0">
                  {tag.linked_tonie ? (
                    <div className="flex items-center gap-2">
                      {/* Cover Image */}
                      {tag.linked_tonie.pic ? (
                        <img
                          src={
                            tag.linked_tonie.pic.startsWith('http://') || tag.linked_tonie.pic.startsWith('https://')
                              ? tag.linked_tonie.pic
                              : `${API_URL}/api/images/${tag.linked_tonie.pic.startsWith('/') ? tag.linked_tonie.pic.substring(1) : tag.linked_tonie.pic}`
                          }
                          alt={tag.linked_tonie.series}
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Tonie Info */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {tag.linked_tonie.series || tag.linked_tonie.title}
                        </div>
                        {tag.linked_tonie.episodes && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {tag.linked_tonie.episodes}
                          </div>
                        )}
                      </div>
                      {/* Category Badge */}
                      <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        tag.linked_tonie.category === 'custom'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                          : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                      }`}>
                        {tag.linked_tonie.category === 'custom' ? t('taf.category.custom') : t('taf.category.official')}
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 dark:text-gray-600 italic">No tonie assigned</div>
                  )}
                </div>

                {/* Actions */}
                {tag.status === 'unconfigured' && onAssignTag && (
                  <button
                    onClick={() => onAssignTag(tag)}
                    className="flex-shrink-0 inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    <svg className="-ml-0.5 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="hidden sm:inline">{t('buttons.assign')}</span>
                  </button>
                )}
              </div>
            </div>
          ))}

          {filteredTags.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500">
              {t('rfid.noTagsFound')}
              {filter !== 'all' && ` ${t('rfid.inCategory')} "${t(`rfid.filters.${filter}`)}"`}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
