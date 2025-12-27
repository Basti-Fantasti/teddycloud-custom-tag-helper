import { useTAFLibrary } from '../hooks/useTAFLibrary';
import { useTranslation } from '../hooks/useTranslation';

/**
 * Toolbar for batch selection operations in TAF Library.
 * Shows selected count and provides batch action buttons.
 */
export default function BatchSelectionToolbar({ onBatchProcess }) {
  const { t } = useTranslation();
  const {
    selectedCount,
    unlinkedCount,
    selectAllUnlinked,
    clearSelection,
  } = useTAFLibrary();

  // Don't show toolbar if no unlinked files
  if (unlinkedCount === 0) {
    return null;
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
      {/* Left: Selection info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {selectedCount > 0 ? (
              t('batch.selectedCount', { count: selectedCount })
            ) : (
              t('batch.selectFilesToProcess')
            )}
          </span>
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-2">
        {/* Select All Unlinked */}
        <button
          onClick={selectAllUnlinked}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800 hover:bg-blue-200 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          {t('batch.selectAllUnlinked', { count: unlinkedCount })}
        </button>

        {/* Clear Selection (only show when something is selected) */}
        {selectedCount > 0 && (
          <button
            onClick={clearSelection}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('batch.clearSelection')}
          </button>
        )}

        {/* Batch Process Button */}
        <button
          onClick={onBatchProcess}
          disabled={selectedCount === 0}
          className={`inline-flex items-center px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selectedCount > 0
              ? 'text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              : 'text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {t('batch.processSelected')}
        </button>
      </div>
    </div>
  );
}
