import { useState, useEffect } from 'react';
import { toniesAPI, libraryAPI, uploadsAPI } from '../api/client';
import LibraryBrowser from './LibraryBrowser';
import CoverSelector from './CoverSelector';
import ConfirmationDialog from './ConfirmationDialog';
import { useDropzone } from 'react-dropzone';
import { API_URL } from '../config/apiConfig';

export default function TonieEditor({ tonie, tafFile, onSave, onCancel }) {
  const isEditMode = !!tonie;

  // Form state
  const [formData, setFormData] = useState({
    model: tonie?.model || '',
    audio_id: tonie?.audio_id?.[0] || '',
    hash: tonie?.hash?.[0] || '',
    series: tonie?.series || '',
    episodes: tonie?.episodes || '',
    title: tonie?.title || '',
    language: tonie?.language || 'en-us',
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
  const [loadingTags, setLoadingTags] = useState(false);
  const [showRFIDSelector, setShowRFIDSelector] = useState(false);

  // Auto-parse TAF file when provided
  useEffect(() => {
    if (tafFile && !isEditMode) {
      parseTAFMetadata(tafFile.name);
    }
  }, [tafFile]);

  // Load available RFID tags when component mounts
  useEffect(() => {
    if (!isEditMode) {
      loadAvailableRFIDTags();
      loadNextModelNumber();
    }
  }, [isEditMode]);

  // Load available covers when gallery is shown
  useEffect(() => {
    if (showCoverGallery) {
      loadAvailableCovers();
    }
  }, [showCoverGallery]);

  // Load available RFID tags
  const loadAvailableRFIDTags = async () => {
    setLoadingTags(true);
    try {
      const response = await fetch(`${API_URL}/api/rfid-tags/`);
      if (!response.ok) throw new Error('Failed to load RFID tags');

      const data = await response.json();
      // Filter to show only unconfigured and unassigned tags
      const availableTags = data.tags.filter(
        tag => tag.status === 'unconfigured' || tag.status === 'unassigned'
      );
      setAvailableRFIDTags(availableTags);
    } catch (err) {
      console.error('Failed to load RFID tags:', err);
    } finally {
      setLoadingTags(false);
    }
  };

  // Load next available model number
  const loadNextModelNumber = async () => {
    try {
      const response = await fetch(`${API_URL}/api/rfid-tags/next-model-number`);
      if (!response.ok) throw new Error('Failed to get next model number');

      const data = await response.json();
      setFormData(prev => ({ ...prev, model: data.next_model_number }));
    } catch (err) {
      console.error('Failed to get next model number:', err);
    }
  };

  // Load available cover images from library
  const loadAvailableCovers = async () => {
    try {
      const response = await uploadsAPI.listCovers();
      setAvailableCovers(response.data.images || []);
    } catch (err) {
      console.error('Failed to load available covers:', err);
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
      const response = await fetch(`${API_URL}/api/taf-metadata/parse?taf_filename=${encodeURIComponent(filename)}`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to parse TAF');

      const data = await response.json();

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
      setError(`Failed to parse TAF: ${err.message}`);
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
      const response = await fetch(`${API_URL}/api/taf-metadata/download-cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl })
      });

      if (!response.ok) throw new Error('Failed to download cover');

      const data = await response.json();
      return data.path;  // Return full path with leading slash
    } catch (err) {
      console.error('Cover download failed:', err);
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
        const response = await fetch(`${API_URL}/api/tonies/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Failed to generate preview');

        const preview = await response.json();
        setPreviewJson(preview);
        setShowConfirmation(true);
      }
    } catch (err) {
      setError(`Failed to generate preview: ${err.message}`);
    }
  };

  // Actually create the tonie after confirmation
  const handleConfirmCreate = async () => {
    setError(null);

    try {
      // Download cover if selected from search results
      let finalFormData = { ...formData };

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
      : `${API_URL}/api/images/${coverPreview.startsWith('/') ? coverPreview.substring(1) : coverPreview}`
    : null;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        {isEditMode ? 'Edit Custom Tonie' : 'Create Custom Tonie'}
      </h2>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Library Browser Modal */}
      {showLibrary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto transition-colors">
            <LibraryBrowser
              onSelect={handleTAFSelect}
              onCancel={() => setShowLibrary(false)}
              parsing={parsing}
            />
          </div>
        </div>
      )}

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
                  Parsing TAF...
                </>
              ) : selectedTAF ? (
                <>✓ {selectedTAF}</>
              ) : (
                <>Browse Library →</>
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
            {/* Show detected tags if available */}
            {!isEditMode && availableRFIDTags.length > 0 ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    {availableRFIDTags.length} available tag{availableRFIDTags.length !== 1 ? 's' : ''} detected
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRFIDSelector(!showRFIDSelector)}
                    className="text-xs text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 underline"
                  >
                    {showRFIDSelector ? 'Hide' : 'Show'}
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
                          {tag.status === 'unconfigured' ? 'Unconfigured' : 'Unassigned'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2 text-xs text-blue-700 dark:text-blue-400">
                  Place a Creative Tonie on your TeddyCloud Box to see it here.
                </div>
              </div>
            ) : loadingTags ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading available tags...</div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm text-yellow-800 dark:text-yellow-200">
                No available tags found. Place a Creative Tonie on your TeddyCloud Box.
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
                Choose from library
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
                    <div className="text-gray-600 dark:text-gray-400">Uploading...</div>
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
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            {isEditMode ? 'Update Tonie' : 'Create Tonie'}
          </button>
        </div>
      </form>

      {/* Cover Gallery Modal */}
      {showCoverGallery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col transition-colors">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Choose from Library</h3>
              <button
                onClick={() => setShowCoverGallery(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {availableCovers.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No covers found in library</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                  {availableCovers.map((cover) => (
                    <button
                      key={cover.filename}
                      onClick={() => handleSelectFromGallery(cover.path)}
                      className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                    >
                      <img
                        src={`${API_URL}/api/images/${cover.path.startsWith('/') ? cover.path.substring(1) : cover.path}`}
                        alt={cover.filename}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
