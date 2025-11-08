import { API_URL } from '../config/apiConfig';

export default function TonieCard({ tonie, onEdit, onDelete }) {
  const coverUrl = tonie.pic
    ? (tonie.pic.startsWith('http://') || tonie.pic.startsWith('https://'))
      ? tonie.pic
      : `${API_URL}/api/images/${tonie.pic}`
    : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden hover:shadow-lg transition-all">
      {/* Cover Image */}
      <div className="aspect-square bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={tonie.series}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <svg
            className="h-24 w-24 text-gray-400 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-lg text-gray-900 dark:text-white truncate" title={tonie.series}>
          {tonie.series}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2" title={tonie.episodes}>
          {tonie.episodes}
        </p>

        <div className="mt-3 space-y-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">RFID:</span>{' '}
            <span className="font-mono">{tonie.model}</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Audio ID:</span>{' '}
            <span className="font-mono">{tonie.audio_id[0]}</span>
          </div>
          {tonie.tracks && tonie.tracks.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Tracks:</span> {tonie.tracks.length}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex space-x-2">
          <button
            onClick={onEdit}
            className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-700 shadow-sm text-sm font-medium rounded-md text-red-700 dark:text-red-400 bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
