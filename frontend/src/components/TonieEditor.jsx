import { useState, useEffect } from 'react';
import { toniesAPI, uploadsAPI, rfidTagsAPI, tafMetadataAPI, imagesAPI } from '../api/client';
import { Button, Modal } from './ui';
import LibraryBrowser from './LibraryBrowser';
import CoverSelector from './CoverSelector';
import ConfirmationDialog from './ConfirmationDialog';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from '../hooks/useTranslation';

export default function TonieEditor({ tonie, tafFile, defaultLanguage = 'en-us', selectedBox, onSave, onCancel }) {
  const { t } = useTranslation();
  const isEditMode = !!tonie;

  // Form state
  const [formData, setFormData] = useState({
    model: tonie?.model || '',
    audio_id: tonie?.audio_id?.[0] || '',
    hash: tonie?.hash?.[0] || '',
    series: tonie?.series || '',
    episodes: tonie?.episodes || '',
    title: tonie?.title || '',
    language: tonie?.language || defaultLanguage,
    pic: tonie?.pic || '',
    tracks: tonie?.tracks || [],
  });

  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedTAF, setSelectedTAF] = useState(null);
  const [coverPreview, setCoverPreview] = useState(tonie?.pic || null);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState(null);
  const [suggestedCovers, setSuggestedCovers] = useState([]);
  const [coverConfidence, setCoverConfidence] = useState(0);
  const [coverSearchTerm, setCoverSearchTerm] = useState('');
  const [availableCovers, setAvailableCovers] = useState([]);
  const [showCoverGallery, setShowCoverGallery] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [previewJson, setPreviewJson] = useState(null);
  const [availableRFIDTags, setAvailableRFIDTags] = useState([]);
  const [activeTagUid, setActiveTagUid] = useState(null);
  const [loadingTags, setLoadingTags] = useState(false);
  const [showRFIDSelector, setShowRFIDSelector] = useState(false);

  // Auto-parse TAF file when provided
  useEffect(() => {
    if (tafFile && !isEditMode) {
      parseTAFMetadata(tafFile.name);
    }
  }, [tafFile]);

  // Load available RFID tags when component mounts or selectedBox changes
  useEffect(() => {
    if (!isEditMode) {
      loadAvailableRFIDTags();
      loadNextModelNumber();
    }
  }, [isEditMode, selectedBox]);

  // Load available covers when gallery is shown
  useEffect(() => {
    if (showCoverGallery) {
      loadAvailableCovers();
    }
  }, [showCoverGallery]);

  // Load available RFID tags for the selected Toniebox
  const loadAvailableRFIDTags = async () => {
    // Use box-specific API if a box is selected, otherwise show no tags
    if (!selectedBox) {
      setAvailableRFIDTags([]);
      setActiveTagUid(null);
      return;
    }
    setLoadingTags(true);
    try {
      const { data } = await rfidTagsAPI.getBoxTags(selectedBox);

      // Store the active tag UID (the one currently on the box)
      setActiveTagUid(data.active_tag_uid || null);

      // Filter to show only unconfigured and unassigned tags
      const availableTags = (data.tags || []).filter(
        tag => tag.status === 'unconfigured' || tag.status === 'unassigned',
      );

      setAvailableRFIDTags(availableTags);
    } catch (_err) {
      // Silent fail - tags are optional
    } finally {
      setLoadingTags(false);
    }
  };

  // Load next available model number
  const loadNextModelNumber = async () => {
    try {
      const { data } = await rfidTagsAPI.getNextModelNumber();
      setFormData(prev => ({ ...prev, model: data.next_model_number }));
    } catch (_err) {
      // Silent fail - model will be auto-assigned
    }
  };

  // Load available cover images from library
  const loadAvailableCovers = async () => {
    try {
      const { data } = await uploadsAPI.listCovers();
      setAvailableCovers(data.images || []);
    } catch (_err) {
      // Silent fail - gallery will show empty
    }
  };

  // Select cover from gallery
  const handleSelectFromGallery = (coverPath) => {
    setCoverPreview(coverPath);
    setFormData((prev) => ({ ...prev, pic: coverPath }));
    setSelectedCoverUrl(null);
    setShowCoverGallery(false);
  };

  // Parse TAF metadata with automatic cover search
  const parseTAFMetadata = async (filename) => {
    setParsing(true);
    setError(null);

    try {
      const { data } = await tafMetadataAPI.parse(filename);

      // Pre-populate form fields
      setFormData((prev) => ({
        ...prev,
        audio_id: String(data.audio_id || ''),
        hash: data.hash || '',
        series: data.series || prev.series,
        episodes: data.episode || prev.episodes,
        language: data.category === 'hörspiel' || data.category === 'hoerspiel' ? 'de-de' : prev.language,
      }));

      setSelectedTAF(filename);

      // Set cover suggestions
      if (data.suggested_covers && data.suggested_covers.length > 0) {
        setSuggestedCovers(data.suggested_covers);
        setCoverConfidence(data.cover_confidence || 0);
        setCoverSearchTerm(data.search_term || '');

        // Auto-select first cover if high confidence
        if (data.cover_confidence >= 80) {
          setSelectedCoverUrl(data.suggested_covers[0].url);
        }
      }

    } catch (err) {
      setError(`Failed to parse TAF: ${err.userMessage || err.message}`);
    } finally {
      setParsing(false);
    }
  };

  // Handle TAF file selection from library
  const handleTAFSelect = async (tafPath) => {
    setShowLibrary(false);
    await parseTAFMetadata(tafPath);
  };

  // Handle cover image upload
  const onDrop = async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setError(null);

    try {
      const response = await uploadsAPI.uploadCover(file);
      const { path } = response.data;

      setFormData((prev) => ({ ...prev, pic: path }));
      setCoverPreview(path);
      setSelectedCoverUrl(null);  // Clear selected URL to show uploaded cover
    } catch (err) {
      setError(`Failed to upload cover: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    disabled: uploading,
  });

  // Download cover and get filename
  const downloadCover = async (imageUrl) => {
    try {
      const { data } = await tafMetadataAPI.downloadCover(imageUrl);
      return data.path;  // Return full path with leading slash
    } catch (_err) {
      return null;
    }
  };

  // Handle form submission - show preview first
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.audio_id) {
      setError('Audio ID is required');
      return;
    }
    if (!formData.hash) {
      setError('Hash is required');
      return;
    }
    if (!formData.series) {
      setError('Series name is required');
      return;
    }

    // If model is not provided, it will be auto-assigned by the backend

    try {
      if (isEditMode) {
        // For edit mode, directly update
        await toniesAPI.update(tonie.no, formData);
        onSave();
      } else {
        // For create mode, show preview first
        const { data: preview } = await toniesAPI.preview(formData);
        setPreviewJson(preview);
        setShowConfirmation(true);
      }
    } catch (err) {
      setError(`Failed to generate preview: ${err.userMessage || err.message}`);
    }
  };

  // Actually create the tonie after confirmation
  const handleConfirmCreate = async () => {
    setError(null);

    try {
      // Download cover if selected from search results
      const finalFormData = { ...formData };

      if (selectedCoverUrl && !coverPreview) {
        const coverPath = await downloadCover(selectedCoverUrl);
        if (coverPath) {
          finalFormData.pic = coverPath;  // Use full path directly
        }
      }

      await toniesAPI.create(finalFormData);
      setShowConfirmation(false);
      onSave();
    } catch (err) {
      setError(`Failed to save: ${err.response?.data?.detail || err.message}`);
      throw err; // Re-throw to let ConfirmationDialog handle it
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const coverUrl = coverPreview
    ? (coverPreview.startsWith('http://') || coverPreview.startsWith('https://'))
      ? coverPreview
      : imagesAPI.getUrl(coverPreview)
    : null;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        {isEditMode ? t('tonieEditor.editTitle') : t('tonieEditor.createTitle')}
      </h2>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Library Browser Modal */}
      <Modal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        title="Select TAF File"
        size="xl"
      >
        <LibraryBrowser
          onSelect={handleTAFSelect}
          onCancel={() => setShowLibrary(false)}
          parsing={parsing}
        />
      </Modal>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* TAF Selection */}
        {!isEditMode && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              1. Select TAF File from Library
            </label>
            <button
              type="button"
              onClick={() => setShowLibrary(true)}
              disabled={parsing}
              className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              {parsing ? (
                <>
                  <div className="animate-spin mr-2 h-5 w-5 border-b-2 border-blue-500"></div>
                  {t('tonieEditor.parsingTaf')}
                </>
              ) : selectedTAF ? (
                <>✓ {selectedTAF}</>
              ) : (
                <>{t('tonieEditor.browseLibrary')}</>
              )}
            </button>
          </div>
        )}

        {/* Metadata Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Audio ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Audio ID *
            </label>
            <input
              type="text"
              name="audio_id"
              value={formData.audio_id}
              onChange={handleChange}
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Auto-filled from TAF"
            />
          </div>

          {/* Hash */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Hash *
            </label>
            <input
              type="text"
              name="hash"
              value={formData.hash}
              onChange={handleChange}
              required
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm transition-colors"
              placeholder="Auto-filled from TAF"
            />
          </div>
        </div>

        {/* Series */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Series Name *
          </label>
          <input
            type="text"
            name="series"
            value={formData.series}
            onChange={handleChange}
            required
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition-colors"
            placeholder="e.g., Die Schule der magischen Tiere"
          />
        </div>

        {/* Episodes/Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Episode / Description *
          </label>
          <textarea
            name="episodes"
            value={formData.episodes}
            onChange={handleChange}
            required
            rows={3}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition-colors"
            placeholder="e.g., Folge 1 - Die Schule der magischen Tiere"
          />
        </div>

        {/* RFID Tag */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            RFID Tag / Model (optional)
          </label>

          <div className="mt-1 space-y-2">
            {/* Show the currently active tag prominently */}
            {!isEditMode && activeTagUid && (() => {
              const activeTag = availableRFIDTags.find(tag => tag.uid === activeTagUid);
              const otherTags = availableRFIDTags.filter(tag => tag.uid !== activeTagUid);

              return (
                <div className="space-y-2">
                  {/* Active tag - prominently displayed */}
                  {activeTag && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium text-green-800 dark:text-green-200">
                          {t('tonieEditor.tagDetectedOnBox')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, model: activeTag.model || prev.model }));
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-700 border-2 border-green-400 dark:border-green-600 rounded hover:bg-green-50 dark:hover:bg-green-900/30 text-sm transition-colors"
                      >
                        <span className="font-mono text-gray-700 dark:text-gray-300">
                          {activeTag.uid}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            activeTag.status === 'unconfigured'
                              ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                              : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                          }`}>
                            {activeTag.status === 'unconfigured' ? t('tonieEditor.tagStatus.unconfigured') : t('tonieEditor.tagStatus.unassigned')}
                          </span>
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            {t('tonieEditor.useThisTag')}
                          </span>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Other available tags - collapsible */}
                  {otherTags.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {otherTags.length} {t('tonieEditor.otherAvailableTags')}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowRFIDSelector(!showRFIDSelector)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
                        >
                          {showRFIDSelector ? t('tonieEditor.hide') : t('tonieEditor.show')}
                        </button>
                      </div>

                      {showRFIDSelector && (
                        <div className="mt-2 space-y-1">
                          {otherTags.map((tag) => (
                            <button
                              key={tag.uid}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({ ...prev, model: tag.model || prev.model }));
                                setShowRFIDSelector(false);
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm transition-colors"
                            >
                              <span className="font-mono text-gray-700 dark:text-gray-300">
                                {tag.uid}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                tag.status === 'unconfigured'
                                  ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                                  : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                              }`}>
                                {tag.status === 'unconfigured' ? t('tonieEditor.tagStatus.unconfigured') : t('tonieEditor.tagStatus.unassigned')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* No active tag but other tags available */}
            {!isEditMode && !activeTagUid && availableRFIDTags.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    {availableRFIDTags.length} {t('tonieEditor.availableTags')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRFIDSelector(!showRFIDSelector)}
                    className="text-xs text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 underline"
                  >
                    {showRFIDSelector ? t('tonieEditor.hide') : t('tonieEditor.show')}
                  </button>
                </div>

                {showRFIDSelector && (
                  <div className="mt-2 space-y-1">
                    {availableRFIDTags.map((tag) => (
                      <button
                        key={tag.uid}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, model: tag.model || prev.model }));
                          setShowRFIDSelector(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm transition-colors"
                      >
                        <span className="font-mono text-gray-700 dark:text-gray-300">
                          {tag.uid}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          tag.status === 'unconfigured'
                            ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                            : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                        }`}>
                          {tag.status === 'unconfigured' ? t('tonieEditor.tagStatus.unconfigured') : t('tonieEditor.tagStatus.unassigned')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2 text-xs text-blue-700 dark:text-blue-400">
                  {t('tonieEditor.placeCreativeTonie')}
                </div>
              </div>
            )}

            {/* Loading state */}
            {loadingTags && (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading available tags...</div>
            )}

            {/* No tags found */}
            {!isEditMode && !loadingTags && availableRFIDTags.length === 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm text-yellow-800 dark:text-yellow-200">
                {t('tonieEditor.noTagsFound')}
              </div>
            )}

            {/* Model number (auto-assigned or manual) */}
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Model Number (optional - auto-assigned if empty)
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                className="block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm transition-colors"
                placeholder="900001 (leave empty for auto-assignment)"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                If empty, the next available number will be automatically assigned
              </p>
            </div>
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Language
          </label>
          <select
            name="language"
            value={formData.language}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            <option value="en-us">English (US)</option>
            <option value="de-de">Deutsch</option>
            <option value="fr-fr">Français</option>
            <option value="es-es">Español</option>
          </select>
        </div>

        {/* Cover Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Cover Image
          </label>

          {/* Cover Selector - Auto-search results */}
          {suggestedCovers.length > 0 && (
            <CoverSelector
              suggestedCovers={suggestedCovers}
              confidence={coverConfidence}
              searchTerm={coverSearchTerm}
              onSelectCover={setSelectedCoverUrl}
              selectedCoverUrl={selectedCoverUrl}
            />
          )}

          {/* Manual upload option */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Or upload manually:
              </div>
              <button
                type="button"
                onClick={() => setShowCoverGallery(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {t('tonieEditor.chooseFromLibrary')}
              </button>
            </div>
            <div className="flex space-x-4">
              {/* Preview */}
              <div className="w-32 h-32 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                {coverUrl || selectedCoverUrl ? (
                  <img
                    src={selectedCoverUrl || coverUrl}
                    alt="Cover"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <svg
                    className="h-12 w-12 text-gray-400 dark:text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </div>

              {/* Dropzone */}
              <div {...getRootProps()} className="flex-1">
                <input {...getInputProps()} />
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {uploading ? (
                    <div className="text-gray-600 dark:text-gray-400">{t('tonieEditor.uploading')}</div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Drag & drop cover image, or click to select
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        JPG, PNG, WEBP up to 5MB
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {isEditMode ? t('tonieEditor.updateTonie') : t('tonieEditor.createTonie')}
          </Button>
        </div>
      </form>

      {/* Cover Gallery Modal */}
      <Modal
        isOpen={showCoverGallery}
        onClose={() => setShowCoverGallery(false)}
        title={t('tonieEditor.chooseFromLibraryTitle')}
        size="xl"
      >
        {availableCovers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('tonieEditor.noCoversInLibrary')}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {availableCovers.map((cover) => (
              <button
                key={cover.filename}
                onClick={() => handleSelectFromGallery(cover.path)}
                className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
              >
                <img
                  src={imagesAPI.getUrl(cover.path)}
                  alt={cover.filename}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        tonieData={formData}
        previewJson={previewJson}
        selectedCover={selectedCoverUrl ? { url: selectedCoverUrl } : null}
        onConfirm={handleConfirmCreate}
      />
    </div>
  );
}
