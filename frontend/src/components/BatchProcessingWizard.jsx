import { useState, useEffect, useMemo } from 'react';
import { batchAPI } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL } from '../config/apiConfig';

/**
 * Multi-step wizard for batch processing TAF files.
 *
 * Steps:
 * 0. Analyzing - Match against tonies.json (loading state)
 * 1. Review Matches - User reviews and confirms matches
 * 2. Confirm - Final review before processing
 * 3. Processing/Complete - Create tonie entries and show results
 */
export default function BatchProcessingWizard({
  isOpen,
  onClose,
  onComplete,
  selectedPaths,
  defaultLanguage,
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Analysis results from backend
  const [analysisResults, setAnalysisResults] = useState(null);

  // User selections: Map of taf_path -> selected candidate or null (skip)
  const [selections, setSelections] = useState({});

  // Processing results
  const [processResults, setProcessResults] = useState(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setError(null);
      setAnalysisResults(null);
      setSelections({});
      setProcessResults(null);
      startAnalysis();
    }
  }, [isOpen, selectedPaths]);

  const startAnalysis = async () => {
    if (!selectedPaths || selectedPaths.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await batchAPI.analyze(selectedPaths);
      const results = response.data;
      setAnalysisResults(results);

      // Initialize selections with auto-selected or best matches
      const initialSelections = {};
      for (const result of results.results) {
        if (result.auto_selected && result.best_match) {
          // Auto-matched with high confidence
          initialSelections[result.taf_path] = {
            ...result.best_match,
            source: 'official',
          };
        } else if (result.best_match) {
          // Has candidates but needs review - preselect best
          initialSelections[result.taf_path] = {
            ...result.best_match,
            source: 'official',
          };
        } else {
          // No match - will need manual entry or skip
          initialSelections[result.taf_path] = null;
        }
      }
      setSelections(initialSelections);
      setStep(1);
    } catch (err) {
      setError(err.userMessage || err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  // Update a selection for a specific file
  const updateSelection = (tafPath, candidate) => {
    setSelections(prev => ({
      ...prev,
      [tafPath]: candidate,
    }));
  };

  // Skip a file
  const skipFile = (tafPath) => {
    setSelections(prev => ({
      ...prev,
      [tafPath]: null,
    }));
  };

  // Count of files that will be processed
  const filesToProcess = useMemo(() => {
    return Object.values(selections).filter(s => s !== null).length;
  }, [selections]);

  // Start processing
  const startProcessing = async () => {
    setStep(3);
    setLoading(true);
    setError(null);

    try {
      // Build selections array for API
      const selectionsArray = [];
      for (const [tafPath, selection] of Object.entries(selections)) {
        if (selection === null) continue; // Skip null (skipped files)

        // Find the original result for this file
        const result = analysisResults.results.find(r => r.taf_path === tafPath);

        selectionsArray.push({
          taf_path: tafPath,
          source: selection.source || 'official',
          tonie_index: selection.tonie_index,
          series: selection.series,
          episodes: selection.episodes,
          pic_url: selection.pic,
          audio_id: result?.audio_id,
          hash: result?.hash,
          language: selection.language || defaultLanguage,
        });
      }

      const response = await batchAPI.process(selectionsArray);
      setProcessResults(response.data);
    } catch (err) {
      setError(err.userMessage || err.message || 'Processing failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle completion
  const handleComplete = () => {
    onComplete();
  };

  if (!isOpen) return null;

  const stepLabels = ['Analyze', 'Review', 'Confirm', 'Complete'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity"
          onClick={step === 3 && !loading ? handleComplete : undefined}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {t('batch.wizard.title')}
              </h3>
              <button
                onClick={step === 3 && !loading ? handleComplete : onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step indicator */}
            <div className="mt-4 flex items-center justify-center">
              {stepLabels.map((label, idx) => (
                <div key={label} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    idx < step
                      ? 'bg-green-500 text-white'
                      : idx === step
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                  }`}>
                    {idx < step ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {idx < stepLabels.length - 1 && (
                    <div className={`w-12 h-1 mx-2 ${
                      idx < step ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
            {/* Step 0: Analyzing */}
            {step === 0 && loading && (
              <div className="flex flex-col items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">
                  {t('batch.wizard.analyzing')}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                  {t('batch.wizard.analyzingDescription')}
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Step 1: Review Matches */}
            {step === 1 && analysisResults && (
              <ReviewStep
                results={analysisResults.results}
                selections={selections}
                onUpdateSelection={updateSelection}
                onSkipFile={skipFile}
                t={t}
              />
            )}

            {/* Step 2: Confirm */}
            {step === 2 && (
              <ConfirmStep
                results={analysisResults?.results || []}
                selections={selections}
                filesToProcess={filesToProcess}
                t={t}
              />
            )}

            {/* Step 3: Processing/Complete */}
            {step === 3 && (
              <ProcessingStep
                loading={loading}
                processResults={processResults}
                t={t}
              />
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-t border-gray-200 dark:border-gray-600 flex justify-between">
            <button
              onClick={step === 3 && !loading ? handleComplete : onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors"
            >
              {step === 3 && !loading ? t('batch.wizard.close') : t('buttons.cancel')}
            </button>
            <div className="flex gap-2">
              {step > 0 && step < 3 && (
                <button
                  onClick={() => setStep(step - 1)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
                >
                  {t('batch.wizard.back')}
                </button>
              )}
              {step === 1 && (
                <button
                  onClick={() => setStep(2)}
                  disabled={filesToProcess === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {t('batch.wizard.next')} ({filesToProcess})
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={startProcessing}
                  disabled={filesToProcess === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {t('batch.wizard.process')} ({filesToProcess})
                </button>
              )}
              {step === 3 && !loading && (
                <button
                  onClick={handleComplete}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
                >
                  {t('batch.wizard.close')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Review Step Component - Shows all matches for review
 */
function ReviewStep({ results, selections, onUpdateSelection, onSkipFile, t }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-green-600 dark:text-green-400">
            {results.filter(r => r.auto_selected).length}
          </div>
          <div className="text-xs text-green-700 dark:text-green-300">
            {t('batch.wizard.autoMatched')}
          </div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
            {results.filter(r => !r.auto_selected && r.candidates?.length > 0).length}
          </div>
          <div className="text-xs text-yellow-700 dark:text-yellow-300">
            {t('batch.wizard.needsReview')}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-gray-600 dark:text-gray-400">
            {results.filter(r => !r.candidates || r.candidates.length === 0).length}
          </div>
          <div className="text-xs text-gray-700 dark:text-gray-300">
            {t('batch.wizard.noMatch')}
          </div>
        </div>
      </div>

      {/* Results list */}
      <div className="space-y-3">
        {results.map((result) => (
          <MatchResultRow
            key={result.taf_path}
            result={result}
            selection={selections[result.taf_path]}
            onSelect={(candidate) => onUpdateSelection(result.taf_path, candidate)}
            onSkip={() => onSkipFile(result.taf_path)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single match result row
 */
function MatchResultRow({ result, selection, onSelect, onSkip, t }) {
  const [expanded, setExpanded] = useState(false);
  const isSkipped = selection === null;
  const hasMatches = result.candidates && result.candidates.length > 0;

  // Get cover URL for display
  const getCoverUrl = (pic) => {
    if (!pic) return null;
    if (pic.startsWith('http://') || pic.startsWith('https://')) return pic;
    return `${API_URL}/api/images/${pic.startsWith('/') ? pic.substring(1) : pic}`;
  };

  return (
    <div className={`border rounded-lg transition-colors ${
      isSkipped
        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
        : result.auto_selected
          ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
          : hasMatches
            ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
    }`}>
      {/* Main row */}
      <div className="p-3 flex items-center gap-3">
        {/* Status indicator */}
        <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
          isSkipped
            ? 'bg-gray-400'
            : result.auto_selected
              ? 'bg-green-500'
              : hasMatches
                ? 'bg-yellow-500'
                : 'bg-gray-400'
        }`} />

        {/* Cover preview */}
        {selection?.pic && (
          <img
            src={getCoverUrl(selection.pic)}
            alt=""
            className="w-10 h-10 rounded object-cover flex-shrink-0"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {result.taf_name}
          </div>
          {selection && !isSkipped && (
            <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {selection.series} {selection.episodes ? `- ${selection.episodes}` : ''}
            </div>
          )}
          {result.parsed_series && !selection && (
            <div className="text-xs text-gray-500 dark:text-gray-500">
              Parsed: {result.parsed_series} {result.parsed_episode || ''}
            </div>
          )}
        </div>

        {/* Confidence badge */}
        {selection && !isSkipped && (
          <div className={`text-xs px-2 py-0.5 rounded-full ${
            (selection.confidence || 0) >= 0.95
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
              : (selection.confidence || 0) >= 0.7
                ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            {Math.round((selection.confidence || 0) * 100)}%
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {hasMatches && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          <button
            onClick={isSkipped ? () => onSelect(result.best_match || result.candidates?.[0]) : onSkip}
            className={`text-xs px-2 py-1 rounded ${
              isSkipped
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {isSkipped ? 'Include' : t('batch.wizard.skipFile')}
          </button>
        </div>
      </div>

      {/* Expanded candidates */}
      {expanded && hasMatches && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2">
          {result.candidates.map((candidate, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSelect({ ...candidate, source: 'official' });
                setExpanded(false);
              }}
              className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${
                selection?.tonie_index === candidate.tonie_index
                  ? 'bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
              }`}
            >
              {candidate.pic && (
                <img
                  src={getCoverUrl(candidate.pic)}
                  alt=""
                  className="w-8 h-8 rounded object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 dark:text-white truncate">
                  {candidate.series}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {candidate.episodes}
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round((candidate.confidence || 0) * 100)}%
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Confirm Step Component
 */
function ConfirmStep({ results, selections, filesToProcess, t }) {
  const selectedItems = results.filter(r => selections[r.taf_path] !== null);
  const skippedItems = results.filter(r => selections[r.taf_path] === null);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {filesToProcess}
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          {t('batch.wizard.confirmDescription')}
        </p>
      </div>

      {/* Summary of what will be created */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
          Will be created:
        </h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 max-h-40 overflow-y-auto">
          {selectedItems.map(item => (
            <li key={item.taf_path} className="truncate">
              • {selections[item.taf_path]?.series || item.taf_name}
            </li>
          ))}
        </ul>
      </div>

      {skippedItems.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
            Will be skipped ({skippedItems.length}):
          </h4>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 max-h-24 overflow-y-auto">
            {skippedItems.map(item => (
              <li key={item.taf_path} className="truncate">
                • {item.taf_name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Processing/Complete Step Component
 */
function ProcessingStep({ loading, processResults, t }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">
          {t('batch.wizard.processing')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          {t('batch.wizard.processingDescription')}
        </p>
      </div>
    );
  }

  if (!processResults) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-center">
        {processResults.failed === 0 ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {t('batch.wizard.complete')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {t('batch.wizard.success', { count: processResults.successful })}
            </p>
          </>
        ) : processResults.successful > 0 ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Partially Complete
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {t('batch.wizard.partialSuccess', {
                success: processResults.successful,
                total: processResults.total,
              })}
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Processing Failed
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {t('batch.wizard.failed', { count: processResults.failed })}
            </p>
          </>
        )}
      </div>

      {/* Details */}
      {processResults.items && processResults.items.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {processResults.items.map((item, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg flex items-center gap-3 ${
                item.success
                  ? 'bg-green-50 dark:bg-green-900/30'
                  : 'bg-red-50 dark:bg-red-900/30'
              }`}
            >
              {item.success ? (
                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${
                  item.success
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  {item.taf_path.split('/').pop()}
                </div>
                {item.error && (
                  <div className="text-xs text-red-600 dark:text-red-400 truncate">
                    {item.error}
                  </div>
                )}
                {item.success && item.model_number && (
                  <div className="text-xs text-green-600 dark:text-green-400">
                    Model: {item.model_number}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
