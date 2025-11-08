import { useState } from 'react';
import { API_URL } from '../config/apiConfig';
import { toniesAPI } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';
import { useTAFLibrary } from '../hooks/useTAFLibrary';

export default function TagSetupDialog({ isOpen, onClose, availableTag, onSuccess }) {
  const { t } = useTranslation();
  const { tafFiles, loading } = useTAFLibrary();
  const [linking, setLinking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLinkTag = async (tafFile) => {
    if (!availableTag) return;

    setLinking(true);
    try {
      // Find the model number to use:
      // 1. If TAF already has a linked_tonie (custom or official), use that model number
      // 2. Otherwise, create a new generic custom tonie entry
      let modelNumber;

      if (tafFile.linked_tonie && tafFile.linked_tonie.model) {
        // Use existing tonie's model number
        modelNumber = tafFile.linked_tonie.model;
      } else {
        // Create a new generic custom tonie entry (not tied to any specific tag)
        const audioIdArray = tafFile.audio_id ?
          (Array.isArray(tafFile.audio_id) ? tafFile.audio_id : [tafFile.audio_id]) : [];
        const hashArray = tafFile.hash ?
          (Array.isArray(tafFile.hash) ? tafFile.hash : [tafFile.hash]) : [];

        // Extract filename for display
        const filename = tafFile.name ? tafFile.name.split('/').pop() : 'Unknown';

        modelNumber = await getNextModelNumber();

        const newTonie = {
          model: modelNumber,
          audio_id: audioIdArray,
          hash: hashArray,
          title: filename.replace('.taf', '').replace(/_/g, ' '),
          series: filename.replace('.taf', '').replace(/_/g, ' '),
          episodes: filename.replace('.taf', '').replace(/_/g, ' '),
          tracks: [],
          release: "0",
          language: "de-de",
          category: "custom",
          pic: ""
        };
        await toniesAPI.create(newTonie);
      }

      // Update ONLY the RFID tag's JSON file (not the tonie entry)
      // This allows multiple tags to share the same tonie content
      const tafPath = tafFile.path || tafFile.name;
      const linkResponse = await fetch(`${API_URL}/api/rfid-tags/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_uid: availableTag.uid,
          box_id: availableTag.box_id,
          model: modelNumber,
          taf_path: tafPath
        })
      });

      if (!linkResponse.ok) {
        const error = await linkResponse.json();
        throw new Error(error.detail || 'Failed to link RFID tag');
      }

      const filename = tafFile.name ? tafFile.name.split('/').pop() : 'Unknown';
      const displayName = tafFile.linked_tonie?.series || filename;
      alert(t('tagSetup.linkSuccess', { uid: availableTag.uid || 'unknown', name: displayName }));

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Tag link error:', err);
      alert(t('tagSetup.linkError', { error: err?.message || 'Unknown error' }));
    } finally {
      setLinking(false);
    }
  };

  const getNextModelNumber = async () => {
    try {
      const response = await fetch(`${API_URL}/api/rfid-tags/next-model-number`);
      const data = await response.json();
      return data.next_model_number;
    } catch (err) {
      console.error('Failed to get next model number:', err);
      return "900001";
    }
  };

  if (!isOpen) return null;

  const filteredTafFiles = tafFiles.filter(taf => {
    const query = searchQuery.toLowerCase();
    const tonieInfo = taf.linked_tonie || null;
    return (
      taf.name?.toLowerCase().includes(query) ||
      taf.path?.toLowerCase().includes(query) ||
      tonieInfo?.series?.toLowerCase().includes(query) ||
      tonieInfo?.episodes?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('tagSetup.title')}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('tagSetup.tagUid')}: <span className="font-mono font-semibold">{availableTag?.uid}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={linking}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('tagSetup.searchPlaceholder')}
              className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 dark:text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredTafFiles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? t('tagSetup.noFilesFound') : t('tagSetup.noFilesAvailable')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTafFiles.map((tafFile, index) => {
                // Backend returns linked_tonie as a single object, not an array
                const linkedTonie = tafFile.linked_tonie || null;

                // Extract filename from path for display
                const filename = tafFile.name ? tafFile.name.split('/').pop() : 'Unknown';
                const displayName = linkedTonie?.series || filename.replace('.taf', '').replace(/_/g, ' ');
                const displayCover = linkedTonie?.pic;

                return (
                  <button
                    key={index}
                    onClick={() => handleLinkTag(tafFile)}
                    disabled={linking}
                    className="group relative bg-white dark:bg-gray-700 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-all overflow-hidden text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {/* Cover Image */}
                    <div className="aspect-square bg-gray-100 dark:bg-gray-800 relative">
                      {displayCover ? (
                        <img
                          src={
                            displayCover.startsWith('http://') || displayCover.startsWith('https://')
                              ? displayCover
                              : `${API_URL}/api/images/${displayCover.startsWith('/') ? displayCover.substring(1) : displayCover}`
                          }
                          alt={displayName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-16 h-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                          </svg>
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-blue-600 bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                        <svg
                          className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 mb-1">
                        {displayName}
                      </h3>
                      {linkedTonie?.episodes && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                          {linkedTonie.episodes}
                        </p>
                      )}
                      {tafFile.path && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {tafFile.path}
                        </p>
                      )}
                      {linkedTonie && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                          {t('tagSetup.alreadyLinked')}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {filteredTafFiles.length} {filteredTafFiles.length === 1 ? t('tagSetup.filesAvailable') : t('tagSetup.filesAvailablePlural')} {t('tagSetup.available')}
          </p>
          <button
            onClick={onClose}
            disabled={linking}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
          >
            {t('buttons.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
