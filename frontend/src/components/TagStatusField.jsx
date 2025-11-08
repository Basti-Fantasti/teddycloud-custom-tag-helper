import { useState } from 'react';
import { API_URL } from '../config/apiConfig';
import { useTranslation } from '../hooks/useTranslation';

export default function TagStatusField({ selectedBox, onSetupTag }) {
  const { t } = useTranslation();
  const [tagInfo, setTagInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadTagStatus = async () => {
    if (!selectedBox) {
      setTagInfo(null);
      return;
    }

    setLoading(true);
    try {
      // Get the last played RUID from our backend (which proxies to TeddyCloud)
      const ruidResponse = await fetch(`${API_URL}/api/rfid-tags/box/${selectedBox}/last-ruid`);
      const ruidData = await ruidResponse.json();
      const lastRuid = ruidData.last_ruid;

      if (!lastRuid || lastRuid.trim() === '') {
        // No tag on box, check for unconfigured tags
        const tagsResponse = await fetch(`${API_URL}/api/rfid-tags/box/${selectedBox}`);
        const tagsData = await tagsResponse.json();

        const eligibleTag = tagsData.tags.find(tag =>
          tag.status === 'unconfigured' || tag.status === 'unassigned'
        );

        setTagInfo({
          eligibleTag,
          activeTag: null,
          totalTags: tagsData.total_count,
          unconfigured: tagsData.unconfigured_count,
          unassigned: tagsData.unassigned_count,
          assigned: tagsData.assigned_count
        });
        return;
      }

      // Get full tag info for the last played RUID
      const tagsResponse = await fetch(`${API_URL}/api/rfid-tags/box/${selectedBox}`);
      const tagsData = await tagsResponse.json();

      // Find the tag with matching RUID
      const activeTag = tagsData.tags.find(tag =>
        tag.uid.toLowerCase() === lastRuid.trim().toLowerCase()
      );

      // Find unconfigured tags for setup button
      const eligibleTag = tagsData.tags.find(tag =>
        tag.status === 'unconfigured' || tag.status === 'unassigned'
      );

      setTagInfo({
        eligibleTag,
        activeTag: activeTag || null,
        totalTags: tagsData.total_count,
        unconfigured: tagsData.unconfigured_count,
        unassigned: tagsData.unassigned_count,
        assigned: tagsData.assigned_count
      });
    } catch (err) {
      console.error('Failed to load tag status:', err);
      setTagInfo(null);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedBox) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600">
        <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <span className="text-sm text-gray-600 dark:text-gray-400">{t('tagStatus.noBoxSelected')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Status Display */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-md border ${
        tagInfo?.eligibleTag
          ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
      }`}>
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('app.loading')}</span>
          </>
        ) : tagInfo?.activeTag ? (
          <>
            {tagInfo.activeTag.linked_tonie?.pic ? (
              <img
                src={`${API_URL}/api/images/${tagInfo.activeTag.linked_tonie.pic.startsWith('/') ? tagInfo.activeTag.linked_tonie.pic.substring(1) : tagInfo.activeTag.linked_tonie.pic}`}
                alt={tagInfo.activeTag.linked_tonie.series}
                className="w-10 h-10 rounded object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
            ) : null}
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{display: tagInfo.activeTag.linked_tonie?.pic ? 'none' : 'block'}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {tagInfo.activeTag.linked_tonie?.series || 'Unknown'}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {tagInfo.activeTag.linked_tonie?.episodes || tagInfo.activeTag.uid}
              </span>
            </div>
          </>
        ) : tagInfo?.eligibleTag ? (
          <>
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{t('tagStatus.newTagDetected')}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{tagInfo.eligibleTag.uid}</span>
            </div>
            <button
              onClick={() => onSetupTag(tagInfo.eligibleTag)}
              className="ml-2 px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 rounded-md transition-colors"
            >
              {t('buttons.setup')}
            </button>
          </>
        ) : tagInfo ? (
          <>
            <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {t('tagStatus.noTagDetected')}
            </span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('tagStatus.noTagDetected')}</span>
          </>
        )}

        {/* Refresh Button - always present */}
        <button
          onClick={loadTagStatus}
          disabled={loading || !selectedBox}
          className="ml-auto p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('tagStatus.refreshStatus')}
        >
          <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
