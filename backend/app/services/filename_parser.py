"""
Intelligent filename parser for extracting metadata from TAF filenames
"""

import re
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class FilenameParser:
    """Parse TAF filenames to extract series, episode, and other metadata"""

    @staticmethod
    def parse_filename(filename: str) -> Dict[str, Optional[str]]:
        """
        Parse a TAF filename to extract metadata

        Args:
            filename: TAF filename (e.g., "Margit_Auer_-_Die_Schule_der_magischen_Tiere_-_Hoerspiel_-_Folge_01_-_Die_Schule_der_magischen_Tiere.taf")

        Returns:
            Dict with: series, episode, author, category, search_term
        """
        # Remove .taf extension
        name = filename.replace('.taf', '')

        # Replace underscores and normalize separators
        name = name.replace('_', ' ')

        # Try different patterns
        result = {
            'series': None,
            'episode': None,
            'author': None,
            'category': None,
            'search_term': None
        }

        # Pattern 1: "Author - Series - Category - Episode - Title"
        # Example: "Margit Auer - Die Schule der magischen Tiere - Hoerspiel - Folge 01 - Title"
        pattern1 = r'^([^-]+)\s*-\s*([^-]+)\s*-\s*(Hoerspiel|Hörspiel|Audiobook|Musik)\s*-\s*(Folge|Teil|Episode|Track)\s*(\d+)[^-]*(?:-\s*(.+))?$'
        match = re.match(pattern1, name, re.IGNORECASE)
        if match:
            result['author'] = match.group(1).strip()
            result['series'] = match.group(2).strip()
            result['category'] = match.group(3).strip().lower()
            episode_num = match.group(5).strip()
            result['episode'] = f"Folge {episode_num}"
            result['search_term'] = f"{result['series']} {result['episode']}"

            logger.info(f"Parsed (pattern 1): {result}")
            return result

        # Pattern 2: "Series - Episode Number - Title"
        # Example: "Disney - Bambi.taf" or "Series - 01 - Title"
        pattern2 = r'^([^-]+)\s*-\s*(.+)$'
        match = re.match(pattern2, name)
        if match:
            series = match.group(1).strip()
            rest = match.group(2).strip()

            # Check if rest starts with a number
            episode_match = re.match(r'^(\d+)\s*-?\s*(.*)$', rest)
            if episode_match:
                episode_num = episode_match.group(1)
                episode_title = episode_match.group(2).strip()
                result['series'] = series
                result['episode'] = f"{episode_title}" if episode_title else f"Folge {episode_num}"
                result['search_term'] = f"{series} {rest}"
            else:
                # Just series and title
                result['series'] = series
                result['episode'] = rest
                result['search_term'] = f"{series} {rest}"

            logger.info(f"Parsed (pattern 2): {result}")
            return result

        # Pattern 3: Single name (no separator)
        # Just use the whole name as series
        result['series'] = name.strip()
        result['episode'] = "Folge 1"
        result['search_term'] = name.strip()

        logger.info(f"Parsed (pattern 3): {result}")
        return result

    @staticmethod
    def extract_search_terms(filename: str, parsed: Dict[str, Optional[str]]) -> list:
        """
        Generate multiple search terms for cover image search

        Args:
            filename: Original filename
            parsed: Parsed metadata

        Returns:
            List of search terms to try, ordered by priority
        """
        search_terms = []

        # Primary search: series + episode
        if parsed.get('series') and parsed.get('episode'):
            search_terms.append(f"{parsed['series']} {parsed['episode']} hörbuch cover")
            search_terms.append(f"{parsed['series']} {parsed['episode']} audiobook cover")

        # Secondary search: just series
        if parsed.get('series'):
            search_terms.append(f"{parsed['series']} hörbuch cover")
            search_terms.append(f"{parsed['series']} audiobook cover")
            search_terms.append(f"{parsed['series']} book cover")

        # Tertiary: with author
        if parsed.get('author') and parsed.get('series'):
            search_terms.append(f"{parsed['author']} {parsed['series']} cover")

        # Fallback: just the search term
        if parsed.get('search_term'):
            search_terms.append(f"{parsed['search_term']} cover")

        return search_terms

    @staticmethod
    def normalize_series_name(series: str) -> str:
        """
        Normalize series name for better matching

        Args:
            series: Series name

        Returns:
            Normalized series name
        """
        # Remove common prefixes/suffixes
        normalized = series.strip()

        # Remove "Disney -" prefix
        normalized = re.sub(r'^Disney\s*-\s*', '', normalized, flags=re.IGNORECASE)

        # Remove "Hörspiel", "Audiobook", etc.
        normalized = re.sub(r'\s*(Hörspiel|Hoerspiel|Audiobook|Audio Book)\s*', '', normalized, flags=re.IGNORECASE)

        return normalized.strip()
