"""
Audiobook/Music metadata search using proper databases
Uses MusicBrainz and iTunes Search API for reliable metadata and cover art
"""

import logging
import httpx
import asyncio
from typing import List, Dict, Optional
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)


class MetadataSearchService:
    """Search for audiobook/music metadata using MusicBrainz and iTunes"""

    def __init__(self):
        self.user_agent = "TeddyCloudTonieManager/1.0 (https://github.com/teddycloud)"
        self.musicbrainz_url = "https://musicbrainz.org/ws/2"
        self.coverartarchive_url = "https://coverartarchive.org"
        self.itunes_url = "https://itunes.apple.com/search"

    async def search_covers(self, series: str, episode: str = None, limit: int = 5) -> List[Dict[str, str]]:
        """
        Search for cover images using multiple metadata sources

        Args:
            series: Series/album name
            episode: Episode/track name (optional)
            limit: Maximum results to return

        Returns:
            List of cover results with url, thumbnail, source, etc.
        """
        all_results = []

        # Build search queries - prioritize episode-specific search
        search_queries = []
        if episode:
            # Try episode-specific first
            search_queries.append(f"{series} {episode}")
            logger.info(f"Cover search with episode: '{series} {episode}'")
        search_queries.append(series)
        logger.info(f"Cover search queries: {search_queries}")

        # Try MusicBrainz first (best for audiobooks)
        for query in search_queries:
            mb_results = await self._search_musicbrainz(query, limit=3)
            all_results.extend(mb_results)
            if len(all_results) >= limit:
                break
            await asyncio.sleep(1)  # MusicBrainz rate limit: 1 req/sec

        # Try iTunes if we need more results
        if len(all_results) < limit:
            for query in search_queries:
                itunes_results = await self._search_itunes(query, limit=3)
                all_results.extend(itunes_results)
                if len(all_results) >= limit:
                    break

        # Remove duplicates and limit results
        unique_results = self._deduplicate_results(all_results)
        logger.info(f"Found {len(unique_results)} unique cover results")
        return unique_results[:limit]

    async def _search_musicbrainz(self, query: str, limit: int = 3) -> List[Dict]:
        """
        Search MusicBrainz for releases (albums/audiobooks)

        MusicBrainz is perfect for audiobooks and has Cover Art Archive integration
        """
        try:
            logger.info(f"Searching MusicBrainz: {query}")

            async with httpx.AsyncClient(timeout=30) as client:
                # Search for releases
                url = f"{self.musicbrainz_url}/release"
                params = {
                    "query": query,
                    "limit": limit,
                    "fmt": "json"
                }
                headers = {"User-Agent": self.user_agent}

                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()

                results = []
                for release in data.get("releases", []):
                    release_id = release.get("id")
                    title = release.get("title", "")

                    # Get cover art from Cover Art Archive
                    cover_url = await self._get_coverart_archive(release_id)

                    if cover_url:
                        results.append({
                            "url": cover_url,
                            "thumbnail": cover_url.replace("/front", "/front-250"),
                            "title": title,
                            "source": "MusicBrainz",
                            "release_id": release_id,
                            "artist": release.get("artist-credit", [{}])[0].get("name", ""),
                            "score": 85.0,  # MusicBrainz results are high quality
                            "width": 500,
                            "height": 500
                        })

                logger.info(f"MusicBrainz found {len(results)} results")
                return results

        except Exception as e:
            logger.error(f"MusicBrainz search failed: {e}")
            return []

    async def _get_coverart_archive(self, release_id: str) -> Optional[str]:
        """
        Get cover art URL from Cover Art Archive for a MusicBrainz release

        Args:
            release_id: MusicBrainz release ID

        Returns:
            Cover art URL or None
        """
        try:
            url = f"{self.coverartarchive_url}/release/{release_id}"
            headers = {"User-Agent": self.user_agent}

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)

                if response.status_code == 404:
                    return None

                response.raise_for_status()
                data = response.json()

                # Get front cover
                for image in data.get("images", []):
                    if image.get("front"):
                        return image.get("image")

                # Fallback to first image if no front cover
                if data.get("images"):
                    return data["images"][0].get("image")

        except Exception as e:
            logger.debug(f"Cover Art Archive lookup failed for {release_id}: {e}")
            return None

    async def _search_itunes(self, query: str, limit: int = 3) -> List[Dict]:
        """
        Search iTunes/Apple Music for audiobooks and music

        iTunes has excellent audiobook metadata with cover art
        """
        try:
            logger.info(f"Searching iTunes: {query}")

            async with httpx.AsyncClient(timeout=30) as client:
                # Search both audiobooks and music
                results = []

                for media_type in ["audiobook", "music"]:
                    params = {
                        "term": query,
                        "media": media_type,
                        "entity": "audiobook" if media_type == "audiobook" else "album",
                        "limit": limit,
                        "country": "DE",  # Germany for German audiobooks
                        "lang": "de"
                    }

                    response = await client.get(self.itunes_url, params=params)
                    response.raise_for_status()
                    data = response.json()

                    for item in data.get("results", []):
                        artwork_url = item.get("artworkUrl100", "")
                        if not artwork_url:
                            continue

                        # Get high-res version (replace 100x100 with 600x600)
                        high_res_url = artwork_url.replace("100x100", "600x600")

                        results.append({
                            "url": high_res_url,
                            "thumbnail": artwork_url,
                            "title": item.get("collectionName", ""),
                            "source": f"iTunes ({media_type})",
                            "artist": item.get("artistName", ""),
                            "score": 80.0 if media_type == "audiobook" else 75.0,
                            "width": 600,
                            "height": 600,
                            "release_date": item.get("releaseDate", "")
                        })

                logger.info(f"iTunes found {len(results)} results")
                return results

        except Exception as e:
            logger.error(f"iTunes search failed: {e}")
            return []

    def _deduplicate_results(self, results: List[Dict]) -> List[Dict]:
        """
        Remove duplicate results based on image URL

        Args:
            results: List of search results

        Returns:
            Deduplicated list sorted by score
        """
        seen_urls = set()
        unique_results = []

        # Sort by score first
        sorted_results = sorted(results, key=lambda x: x.get("score", 0), reverse=True)

        for result in sorted_results:
            url = result.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_results.append(result)

        return unique_results

    async def download_image(self, image_url: str) -> Optional[bytes]:
        """
        Download an image from URL

        Args:
            image_url: URL of the image

        Returns:
            Image bytes or None
        """
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                headers = {"User-Agent": self.user_agent}
                response = await client.get(image_url, headers=headers)
                response.raise_for_status()

                # Validate it's an image
                content_type = response.headers.get("content-type", "")
                if not content_type.startswith("image/"):
                    logger.warning(f"URL is not an image: {content_type}")
                    return None

                logger.info(f"Downloaded image: {len(response.content)} bytes")
                return response.content

        except Exception as e:
            logger.error(f"Failed to download image: {e}")
            return None
