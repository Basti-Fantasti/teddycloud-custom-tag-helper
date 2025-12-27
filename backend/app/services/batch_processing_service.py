"""
Service for batch processing of TAF files.
Coordinates analysis, metadata search, and tonie creation.
"""

import asyncio
import hashlib
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .teddycloud_client import TeddyCloudClient
from .tonie_matching_service import TonieMatchingService, MatchResult, MatchCandidate
from .metadata_search import MetadataSearchService
from .filename_parser import FilenameParser
from .volume_scanner import VolumeScanner

logger = logging.getLogger(__name__)


class BatchProcessingService:
    """
    Orchestrates batch processing of TAF files.
    - Analyzes TAF files and matches against tonies.json
    - Searches external metadata sources for unmatched files
    - Creates tonie entries in batch
    """

    def __init__(
        self,
        teddycloud_client: TeddyCloudClient,
        settings,
    ):
        """
        Initialize the batch processing service.

        Args:
            teddycloud_client: Client for TeddyCloud API
            settings: Application settings
        """
        self.client = teddycloud_client
        self.settings = settings
        self.matching_service = TonieMatchingService(
            auto_match_threshold=0.95,
            weak_match_threshold=0.60
        )
        self.metadata_service = MetadataSearchService()
        self.volume_scanner = VolumeScanner(settings)

    async def analyze_batch(
        self,
        taf_paths: List[str]
    ) -> Dict:
        """
        Analyze TAF files and match against tonies.json.

        Args:
            taf_paths: List of TAF file paths (relative to library)

        Returns:
            Dict with results, counts, and match data
        """
        # Load official tonies.json if not cached
        if not self.matching_service.is_cache_valid():
            try:
                tonies_data = await self.client.get_tonies_json()
                self.matching_service.load_tonies(tonies_data)
                logger.info(f"Loaded {len(tonies_data)} official tonies for matching")
            except Exception as e:
                logger.error(f"Failed to load tonies.json: {e}")
                # Continue without official database

        # Get TAF headers for all files
        taf_info = await self._get_taf_headers(taf_paths)

        # Parse filenames and match
        files_to_match = []
        for path, info in taf_info.items():
            # Parse filename
            filename = os.path.basename(path)
            parsed = FilenameParser.parse_filename(filename)

            files_to_match.append({
                'path': path,
                'parsed_series': parsed.get('series'),
                'parsed_episode': parsed.get('episode'),
                'audio_id': info.get('audio_id'),
                'hash': info.get('hash'),
            })

        # Match against tonies.json
        match_results = self.matching_service.match_batch(files_to_match)

        # Build response
        results = []
        auto_matched = 0
        needs_review = 0
        unmatched = 0

        for file_info in files_to_match:
            path = file_info['path']
            match_result = match_results.get(path)

            if match_result:
                # Convert MatchCandidate dataclasses to dicts
                candidates = []
                for c in match_result.candidates:
                    candidates.append({
                        'tonie_index': c.tonie_index,
                        'series': c.series,
                        'episodes': c.episodes,
                        'audio_id': c.audio_id,
                        'hash': c.hash,
                        'pic': c.pic,
                        'model': c.model,
                        'language': c.language,
                        'confidence': c.confidence,
                        'match_type': c.match_type,
                    })

                best_match = None
                if match_result.best_match:
                    bm = match_result.best_match
                    best_match = {
                        'tonie_index': bm.tonie_index,
                        'series': bm.series,
                        'episodes': bm.episodes,
                        'audio_id': bm.audio_id,
                        'hash': bm.hash,
                        'pic': bm.pic,
                        'model': bm.model,
                        'language': bm.language,
                        'confidence': bm.confidence,
                        'match_type': bm.match_type,
                    }

                result = {
                    'taf_path': path,
                    'taf_name': os.path.basename(path),
                    'audio_id': file_info.get('audio_id'),
                    'hash': file_info.get('hash'),
                    'parsed_series': match_result.parsed_series,
                    'parsed_episode': match_result.parsed_episode,
                    'candidates': candidates,
                    'best_match': best_match,
                    'auto_selected': match_result.auto_selected,
                }

                if match_result.auto_selected:
                    auto_matched += 1
                elif len(candidates) > 0:
                    needs_review += 1
                else:
                    unmatched += 1

                results.append(result)
            else:
                # No match result (shouldn't happen, but handle gracefully)
                results.append({
                    'taf_path': path,
                    'taf_name': os.path.basename(path),
                    'audio_id': file_info.get('audio_id'),
                    'hash': file_info.get('hash'),
                    'parsed_series': file_info.get('parsed_series'),
                    'parsed_episode': file_info.get('parsed_episode'),
                    'candidates': [],
                    'best_match': None,
                    'auto_selected': False,
                })
                unmatched += 1

        return {
            'results': results,
            'total': len(results),
            'auto_matched': auto_matched,
            'needs_review': needs_review,
            'unmatched': unmatched,
        }

    async def _get_taf_headers(self, taf_paths: List[str]) -> Dict[str, Dict]:
        """
        Get TAF headers for a list of files.

        Args:
            taf_paths: List of TAF file paths

        Returns:
            Dict mapping path to header info (audio_id, hash)
        """
        headers = {}

        # Group by directory for efficient API calls
        by_directory: Dict[str, List[str]] = {}
        for path in taf_paths:
            directory = os.path.dirname(path) or ""
            if directory not in by_directory:
                by_directory[directory] = []
            by_directory[directory].append(path)

        # Fetch file indices by directory in parallel
        async def fetch_directory(directory: str, paths: List[str]):
            try:
                file_index = await self.client.get_file_index(directory)
                files = file_index.get('files', [])

                # Build lookup by filename
                file_lookup = {}
                for f in files:
                    name = f.get('name', '')
                    file_lookup[name] = f

                # Match paths
                for path in paths:
                    filename = os.path.basename(path)
                    if filename in file_lookup:
                        file_info = file_lookup[filename]
                        taf_header = file_info.get('tafHeader', {})
                        headers[path] = {
                            'audio_id': taf_header.get('audioId'),
                            'hash': taf_header.get('sha1Hash'),
                            'track_seconds': taf_header.get('trackSeconds', []),
                        }
                    else:
                        headers[path] = {}
            except Exception as e:
                logger.error(f"Failed to fetch file index for {directory}: {e}")
                for path in paths:
                    headers[path] = {}

        # Execute in parallel
        tasks = [fetch_directory(d, p) for d, p in by_directory.items()]
        await asyncio.gather(*tasks)

        return headers

    async def search_metadata_batch(
        self,
        items: List[Dict]
    ) -> Dict[str, Dict]:
        """
        Search metadata for unmatched TAF files.

        Args:
            items: List of dicts with taf_path, series, episode

        Returns:
            Dict mapping taf_path to search results
        """
        results = {}
        found_count = 0

        for item in items:
            taf_path = item.get('taf_path', '')
            series = item.get('series', '')
            episode = item.get('episode', '')

            try:
                # Use existing metadata search service
                search_term = f"{series} {episode}".strip()
                if not search_term:
                    search_term = os.path.basename(taf_path).replace('.taf', '').replace('_', ' ')

                covers = await self.metadata_service.search_covers(search_term, max_results=5)

                best_cover = covers[0] if covers else None
                confidence = best_cover.get('score', 0) / 100.0 if best_cover else 0.0

                results[taf_path] = {
                    'taf_path': taf_path,
                    'covers': covers,
                    'best_cover': best_cover,
                    'confidence': confidence,
                }

                if covers:
                    found_count += 1

            except Exception as e:
                logger.error(f"Metadata search failed for {taf_path}: {e}")
                results[taf_path] = {
                    'taf_path': taf_path,
                    'covers': [],
                    'best_cover': None,
                    'confidence': 0.0,
                }

        return {
            'results': results,
            'searched': len(items),
            'found': found_count,
        }

    async def process_batch(
        self,
        selections: List[Dict]
    ) -> Dict:
        """
        Process confirmed selections and create tonie entries.

        Args:
            selections: List of selection dicts with metadata

        Returns:
            Dict with processing results
        """
        results = []
        successful = 0
        failed = 0

        # Load current tonies
        try:
            current_tonies = await self.client.get_tonies_custom_json()
        except Exception as e:
            logger.error(f"Failed to load current tonies: {e}")
            return {
                'total': len(selections),
                'successful': 0,
                'failed': len(selections),
                'items': [{
                    'taf_path': s.get('taf_path', ''),
                    'success': False,
                    'error': f"Failed to load current tonies: {e}",
                } for s in selections],
            }

        # Find next model number
        try:
            next_model = self.volume_scanner.get_next_custom_model_number()
        except Exception as e:
            logger.warning(f"Failed to get next model number, using 900001: {e}")
            next_model = 900001

        # Find max 'no' value
        max_no = -1
        for tonie in current_tonies:
            try:
                no = int(tonie.get('no', 0))
                max_no = max(max_no, no)
            except (ValueError, TypeError):
                pass

        # Process each selection
        for selection in selections:
            taf_path = selection.get('taf_path', '')
            try:
                # Download cover
                cover_path = ""
                pic_url = selection.get('pic_url', '')
                if pic_url:
                    try:
                        cover_path = await self._download_cover(pic_url)
                    except Exception as e:
                        logger.warning(f"Failed to download cover for {taf_path}: {e}")
                        # Continue without cover

                # Create tonie entry
                max_no += 1
                model_number = str(next_model)
                next_model += 1

                audio_id = selection.get('audio_id')
                hash_val = selection.get('hash')

                tonie_entry = {
                    'no': str(max_no),
                    'model': model_number,
                    'audio_id': [str(audio_id)] if audio_id else [],
                    'hash': [hash_val] if hash_val else [],
                    'title': selection.get('series', ''),
                    'series': selection.get('series', ''),
                    'episodes': selection.get('episodes', ''),
                    'tracks': [],
                    'release': '0',
                    'language': selection.get('language', 'de-de'),
                    'category': 'custom',
                    'pic': cover_path,
                }

                current_tonies.append(tonie_entry)

                results.append({
                    'taf_path': taf_path,
                    'success': True,
                    'error': None,
                    'model_number': model_number,
                    'cover_path': cover_path,
                    'tonie_entry': tonie_entry,
                })
                successful += 1

            except Exception as e:
                logger.error(f"Failed to process {taf_path}: {e}")
                results.append({
                    'taf_path': taf_path,
                    'success': False,
                    'error': str(e),
                    'model_number': None,
                    'cover_path': None,
                    'tonie_entry': None,
                })
                failed += 1

        # Save all tonies at once (atomic)
        if successful > 0:
            try:
                config_path = self.settings.volumes.config_path
                await self.client.save_tonies_custom_json(current_tonies, config_path)
                logger.info(f"Saved {successful} new tonie entries")

                # Trigger reload
                await self.client.trigger_config_reload()

            except Exception as e:
                logger.error(f"Failed to save tonies: {e}")
                # Mark all as failed
                for result in results:
                    if result['success']:
                        result['success'] = False
                        result['error'] = f"Failed to save: {e}"
                        successful -= 1
                        failed += 1

        return {
            'total': len(selections),
            'successful': successful,
            'failed': failed,
            'items': results,
        }

    async def _download_cover(self, url: str) -> str:
        """
        Download cover image and save locally.

        Args:
            url: Cover image URL

        Returns:
            Local path for use in tonie entry
        """
        from .metadata_search import download_image

        try:
            # Download image
            image_data = await download_image(url)
            if not image_data:
                raise ValueError("Failed to download image")

            # Generate filename from URL hash
            url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
            filename = f"cover_{url_hash}.jpg"

            # Save to custom_img_path
            save_dir = Path(self.settings.volumes.custom_img_path)
            save_dir.mkdir(parents=True, exist_ok=True)
            save_path = save_dir / filename

            with open(save_path, 'wb') as f:
                f.write(image_data)

            logger.debug(f"Saved cover to {save_path}")

            # Return path relative to /data for JSON
            return f"/library/own/pics/{filename}"

        except Exception as e:
            logger.error(f"Failed to download cover from {url}: {e}")
            raise
