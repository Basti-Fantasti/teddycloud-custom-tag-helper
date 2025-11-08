import { useState } from 'react';
import { API_URL } from '../config/apiConfig';

export default function CoverSelector({
  suggestedCovers,
  confidence,
  searchTerm,
  onSelectCover,
  selectedCoverUrl
}) {
  const [showAllCovers, setShowAllCovers] = useState(false);
  const [customSearch, setCustomSearch] = useState(searchTerm || '');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const handleCustomSearch = async () => {
    if (!customSearch.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(`${API_URL}/api/taf-metadata/search-covers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_term: customSearch, limit: 10 })
      });

      if (!response.ok) throw new Error('Search failed');

      const results = await response.json();
      setSearchResults(results);
      setShowAllCovers(true);
    } catch (err) {
      console.error('Cover search failed:', err);
      alert('Failed to search for covers');
    } finally {
      setSearching(false);
    }
  };

  const coversToShow = searchResults.length > 0 ? searchResults : suggestedCovers || [];
  const displayCovers = showAllCovers ? coversToShow : coversToShow.slice(0, 1);

  // Determine confidence level
  let confidenceColor = 'gray';
  let confidenceText = 'Unsure';
  if (confidence >= 80) {
    confidenceColor = 'green';
    confidenceText = 'High confidence';
  } else if (confidence >= 60) {
    confidenceColor = 'yellow';
    confidenceText = 'Medium confidence';
  } else if (confidence >= 40) {
    confidenceColor = 'orange';
    confidenceText = 'Low confidence';
  }

  return (
    <div className="space-y-4">
      {/* Confidence Indicator */}
      {confidence > 0 && (
        <div className={`flex items-center space-x-2 text-sm bg-${confidenceColor}-50 border border-${confidenceColor}-200 rounded-md px-3 py-2`}>
          <div className={`w-2 h-2 rounded-full bg-${confidenceColor}-500`}></div>
          <span className={`text-${confidenceColor}-800 font-medium`}>{confidenceText}</span>
          <span className={`text-${confidenceColor}-600 text-xs`}>
            {suggestedCovers.length} cover{suggestedCovers.length !== 1 ? 's' : ''} found
          </span>
        </div>
      )}

      {/* Cover Preview Grid */}
      {displayCovers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {displayCovers.map((cover, idx) => (
            <div
              key={idx}
              onClick={() => onSelectCover(cover.url)}
              className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                selectedCoverUrl === cover.url
                  ? 'border-blue-500 shadow-lg'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="aspect-square bg-gray-100">
                <img
                  src={cover.thumbnail || cover.url}
                  alt={cover.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>

              {/* Selected Indicator */}
              {selectedCoverUrl === cover.url && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}

              {/* Confidence overlay for first result */}
              {idx === 0 && !showAllCovers && confidence < 80 && (
                <div className="absolute inset-0 bg-yellow-500 bg-opacity-20 flex items-center justify-center">
                  <div className="bg-white bg-opacity-90 rounded-full p-2">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Score badge */}
              {cover.score > 0 && (
                <div className="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white text-xs px-2 py-0.5 rounded">
                  {Math.round(cover.score)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Show More / Less Button */}
      {coversToShow.length > 1 && (
        <button
          type="button"
          onClick={() => setShowAllCovers(!showAllCovers)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {showAllCovers ? '← Show less' : `Show all ${coversToShow.length} covers →`}
        </button>
      )}

      {/* Custom Search */}
      <div className="pt-3 border-t">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Refine cover search
        </label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={customSearch}
            onChange={(e) => setCustomSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCustomSearch()}
            placeholder="Enter search terms..."
            className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <button
            type="button"
            onClick={handleCustomSearch}
            disabled={searching}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {searching ? (
              <div className="animate-spin h-4 w-4 border-b-2 border-gray-700"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Not satisfied? Enter custom search terms to find a better cover
        </p>
      </div>

      {/* No covers found */}
      {coversToShow.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="mt-2 text-sm">No covers found. Try a custom search above.</p>
        </div>
      )}
    </div>
  );
}
