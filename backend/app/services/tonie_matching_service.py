"""
Service for matching TAF files against the official tonies.json database
using fuzzy text matching for series and episode names.
"""

import re
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)


@dataclass
class MatchCandidate:
    """A potential match from tonies.json"""
    tonie_index: int  # Index in the tonies list
    series: str
    episodes: Optional[str]
    audio_id: List[str]
    hash: List[str]
    pic: str
    model: str
    language: str
    confidence: float  # 0.0 to 1.0
    match_type: str  # "exact", "fuzzy_series", "fuzzy_episode", "partial"


@dataclass
class MatchResult:
    """Match results for a single TAF file"""
    taf_path: str
    parsed_series: Optional[str]
    parsed_episode: Optional[str]
    candidates: List[MatchCandidate]
    best_match: Optional[MatchCandidate]
    auto_selected: bool  # True if best_match confidence >= threshold


class TonieMatchingService:
    """
    Service for matching TAF files against the official tonies.json database.
    Uses fuzzy text matching to find the best matches for series and episode names.
    """

    # German articles to remove for normalization
    GERMAN_ARTICLES = ['die', 'der', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen']
    ENGLISH_ARTICLES = ['the', 'a', 'an']

    # Common patterns to normalize
    EPISODE_PATTERNS = [
        r'folge\s*(\d+)',
        r'episode\s*(\d+)',
        r'teil\s*(\d+)',
        r'track\s*(\d+)',
        r'#\s*(\d+)',
        r'(\d+)\.',
    ]

    def __init__(self, auto_match_threshold: float = 0.95, weak_match_threshold: float = 0.60):
        """
        Initialize the matching service.

        Args:
            auto_match_threshold: Confidence threshold for auto-selection (default 0.95)
            weak_match_threshold: Minimum confidence to include as candidate (default 0.60)
        """
        self.auto_match_threshold = auto_match_threshold
        self.weak_match_threshold = weak_match_threshold

        # Cache for tonies.json
        self._tonies_list: List[Dict] = []
        self._series_index: Dict[str, List[int]] = {}  # normalized_series -> indices
        self._last_load: Optional[datetime] = None
        self._cache_ttl = timedelta(minutes=5)

    def load_tonies(self, tonies_data: List[Dict]) -> None:
        """
        Load tonies.json data and build search index.

        Args:
            tonies_data: List of tonie dictionaries from tonies.json
        """
        self._tonies_list = tonies_data
        self._build_index()
        self._last_load = datetime.now()
        logger.info(f"Loaded {len(tonies_data)} tonies into matching service")

    def is_cache_valid(self) -> bool:
        """Check if the cache is still valid."""
        if self._last_load is None:
            return False
        return datetime.now() - self._last_load < self._cache_ttl

    def _build_index(self) -> None:
        """Build search index from tonies list."""
        self._series_index = {}

        for idx, tonie in enumerate(self._tonies_list):
            series = tonie.get('series') or ''
            if series:
                normalized = self._normalize_text(series)
                if normalized not in self._series_index:
                    self._series_index[normalized] = []
                self._series_index[normalized].append(idx)

        logger.debug(f"Built index with {len(self._series_index)} unique series")

    def _normalize_text(self, text: str) -> str:
        """
        Normalize text for matching.

        - Lowercase
        - Remove German/English articles at start
        - Handle umlauts (ä→ae, ö→oe, ü→ue, ß→ss)
        - Remove special characters except alphanumeric and spaces
        - Collapse whitespace
        """
        if not text:
            return ""

        # Lowercase
        normalized = text.lower().strip()

        # Handle umlauts
        normalized = normalized.replace('ä', 'ae')
        normalized = normalized.replace('ö', 'oe')
        normalized = normalized.replace('ü', 'ue')
        normalized = normalized.replace('ß', 'ss')

        # Remove leading articles
        words = normalized.split()
        if words and words[0] in self.GERMAN_ARTICLES + self.ENGLISH_ARTICLES:
            words = words[1:]
        normalized = ' '.join(words)

        # Remove special characters except alphanumeric and spaces
        normalized = re.sub(r'[^a-z0-9\s]', '', normalized)

        # Collapse whitespace
        normalized = ' '.join(normalized.split())

        return normalized

    def _extract_episode_number(self, text: str) -> Optional[int]:
        """Extract episode number from text."""
        if not text:
            return None

        text_lower = text.lower()

        for pattern in self.EPISODE_PATTERNS:
            match = re.search(pattern, text_lower)
            if match:
                try:
                    return int(match.group(1))
                except (ValueError, IndexError):
                    continue

        # Try to find standalone number at start or end
        match = re.match(r'^(\d+)\s', text_lower)
        if match:
            return int(match.group(1))

        match = re.search(r'\s(\d+)$', text_lower)
        if match:
            return int(match.group(1))

        return None

    def _calculate_series_similarity(self, query: str, target: str) -> float:
        """
        Calculate similarity between two series names.
        Uses multiple fuzzy matching algorithms and returns weighted average.
        """
        query_norm = self._normalize_text(query)
        target_norm = self._normalize_text(target)

        if not query_norm or not target_norm:
            return 0.0

        # Exact match after normalization
        if query_norm == target_norm:
            return 1.0

        # Check if one contains the other (high score for containment)
        if query_norm in target_norm or target_norm in query_norm:
            # Penalize by length difference
            length_ratio = min(len(query_norm), len(target_norm)) / max(len(query_norm), len(target_norm))
            return 0.85 + (0.10 * length_ratio)

        # Fuzzy matching with rapidfuzz
        # Use multiple algorithms and take weighted average
        ratio = fuzz.ratio(query_norm, target_norm) / 100.0
        partial_ratio = fuzz.partial_ratio(query_norm, target_norm) / 100.0
        token_sort_ratio = fuzz.token_sort_ratio(query_norm, target_norm) / 100.0
        token_set_ratio = fuzz.token_set_ratio(query_norm, target_norm) / 100.0

        # Weighted average: token_set and partial are more forgiving
        similarity = (
            ratio * 0.15 +
            partial_ratio * 0.25 +
            token_sort_ratio * 0.25 +
            token_set_ratio * 0.35
        )

        return similarity

    def _calculate_episode_similarity(self, query_ep: Optional[str], target_ep: Optional[str]) -> float:
        """
        Calculate similarity between episode descriptions.
        Prioritizes matching episode numbers.
        """
        if not query_ep and not target_ep:
            return 1.0  # Both empty = match

        if not query_ep or not target_ep:
            return 0.5  # One empty = partial match

        # Extract episode numbers
        query_num = self._extract_episode_number(query_ep)
        target_num = self._extract_episode_number(target_ep)

        # If both have episode numbers, compare them
        if query_num is not None and target_num is not None:
            if query_num == target_num:
                return 1.0
            else:
                return 0.2  # Different episode numbers = low match

        # Fallback to text similarity
        query_norm = self._normalize_text(query_ep)
        target_norm = self._normalize_text(target_ep)

        if query_norm == target_norm:
            return 1.0

        return fuzz.token_set_ratio(query_norm, target_norm) / 100.0

    def match_single(
        self,
        parsed_series: Optional[str],
        parsed_episode: Optional[str],
        taf_path: str,
        max_candidates: int = 10
    ) -> MatchResult:
        """
        Match a single TAF file against tonies.json.

        Args:
            parsed_series: Series name extracted from filename
            parsed_episode: Episode description extracted from filename
            taf_path: Path to the TAF file (for result tracking)
            max_candidates: Maximum number of candidates to return

        Returns:
            MatchResult with ranked candidates
        """
        candidates: List[MatchCandidate] = []

        if not parsed_series or not self._tonies_list:
            return MatchResult(
                taf_path=taf_path,
                parsed_series=parsed_series,
                parsed_episode=parsed_episode,
                candidates=[],
                best_match=None,
                auto_selected=False
            )

        # Find potential matches by series similarity
        series_scores: List[Tuple[int, float]] = []  # (index, score)

        for idx, tonie in enumerate(self._tonies_list):
            tonie_series = tonie.get('series') or ''
            if not tonie_series:
                continue

            series_sim = self._calculate_series_similarity(parsed_series, tonie_series)

            if series_sim >= self.weak_match_threshold:
                series_scores.append((idx, series_sim))

        # Sort by series similarity
        series_scores.sort(key=lambda x: x[1], reverse=True)

        # Take top candidates and calculate combined scores
        for idx, series_sim in series_scores[:max_candidates * 2]:
            tonie = self._tonies_list[idx]
            tonie_episodes = tonie.get('episodes')

            # Calculate episode similarity
            episode_sim = self._calculate_episode_similarity(parsed_episode, tonie_episodes)

            # Combined confidence: series is more important
            confidence = (series_sim * 0.6) + (episode_sim * 0.4)

            # Determine match type
            if confidence >= 0.95:
                match_type = "exact"
            elif series_sim >= 0.90 and episode_sim >= 0.80:
                match_type = "fuzzy_episode"
            elif series_sim >= 0.80:
                match_type = "fuzzy_series"
            else:
                match_type = "partial"

            # Only include if above weak threshold
            if confidence >= self.weak_match_threshold:
                candidates.append(MatchCandidate(
                    tonie_index=idx,
                    series=tonie.get('series', ''),
                    episodes=tonie.get('episodes'),
                    audio_id=tonie.get('audio_id', []),
                    hash=tonie.get('hash', []),
                    pic=tonie.get('pic', ''),
                    model=tonie.get('model', ''),
                    language=tonie.get('language', 'de-de'),
                    confidence=confidence,
                    match_type=match_type
                ))

        # Sort by confidence and limit
        candidates.sort(key=lambda c: c.confidence, reverse=True)
        candidates = candidates[:max_candidates]

        # Determine best match and auto-selection
        best_match = candidates[0] if candidates else None
        auto_selected = best_match is not None and best_match.confidence >= self.auto_match_threshold

        return MatchResult(
            taf_path=taf_path,
            parsed_series=parsed_series,
            parsed_episode=parsed_episode,
            candidates=candidates,
            best_match=best_match,
            auto_selected=auto_selected
        )

    def match_batch(
        self,
        files: List[Dict],
        max_candidates_per_file: int = 5
    ) -> Dict[str, MatchResult]:
        """
        Match multiple TAF files against tonies.json efficiently.

        Args:
            files: List of dicts with 'path', 'parsed_series', 'parsed_episode' keys
            max_candidates_per_file: Maximum candidates per file

        Returns:
            Dict mapping taf_path to MatchResult
        """
        results: Dict[str, MatchResult] = {}

        for file_info in files:
            taf_path = file_info.get('path', '')
            parsed_series = file_info.get('parsed_series')
            parsed_episode = file_info.get('parsed_episode')

            result = self.match_single(
                parsed_series=parsed_series,
                parsed_episode=parsed_episode,
                taf_path=taf_path,
                max_candidates=max_candidates_per_file
            )

            results[taf_path] = result

        return results

    def get_stats(self) -> Dict:
        """Get statistics about the loaded tonies database."""
        if not self._tonies_list:
            return {
                "loaded": False,
                "total_tonies": 0,
                "unique_series": 0,
                "cache_valid": False
            }

        return {
            "loaded": True,
            "total_tonies": len(self._tonies_list),
            "unique_series": len(self._series_index),
            "cache_valid": self.is_cache_valid(),
            "last_load": self._last_load.isoformat() if self._last_load else None
        }
