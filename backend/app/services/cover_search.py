"""
Cover image search service
Uses DuckDuckGo Images to find cover images for audiobooks
"""

import logging
import httpx
import re
from typing import List, Dict, Optional
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)


class CoverSearchService:
    """Search for cover images using DuckDuckGo Images"""

    def __init__(self):
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

    async def search_covers(self, search_term: str, limit: int = 5) -> List[Dict[str, str]]:
        """
        Search for cover images

        Args:
            search_term: Search query (e.g., "Die Schule der magischen Tiere Folge 1")
            limit: Maximum number of results

        Returns:
            List of image results with url, thumbnail, title
        """
        try:
            logger.info(f"Searching for covers: {search_term}")

            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                # DuckDuckGo Images search
                url = f"https://duckduckgo.com/"
                params = {"q": search_term, "t": "h_", "iax": "images", "ia": "images"}

                headers = {
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                }

                # Get search page to get vqd token
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()

                # Extract vqd token from page
                vqd_match = re.search(r'vqd=["\']([\d-]+)["\']', response.text)
                if not vqd_match:
                    logger.warning("Could not extract vqd token, trying alternative method")
                    # Try to extract from JavaScript
                    vqd_match = re.search(r'vqd="([\d-]+)"', response.text)
                    if not vqd_match:
                        logger.error("Failed to get vqd token")
                        return []

                vqd = vqd_match.group(1)
                logger.debug(f"Got vqd token: {vqd}")

                # Search for images
                search_url = "https://duckduckgo.com/i.js"
                params = {
                    "l": "us-en",
                    "o": "json",
                    "q": search_term,
                    "vqd": vqd,
                    "f": ",,,",
                    "p": "1",
                    "v7exp": "a",
                }

                response = await client.get(search_url, params=params, headers=headers)
                response.raise_for_status()

                data = response.json()
                results = []

                for item in data.get("results", [])[:limit]:
                    results.append({
                        "url": item.get("image"),
                        "thumbnail": item.get("thumbnail"),
                        "title": item.get("title", ""),
                        "source": item.get("url", ""),
                        "width": item.get("width", 0),
                        "height": item.get("height", 0),
                    })

                logger.info(f"Found {len(results)} cover images for '{search_term}'")
                return results

        except Exception as e:
            logger.error(f"Failed to search covers: {e}")
            return []

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

    def score_image(self, image: Dict[str, any], search_term: str) -> float:
        """
        Score an image result based on relevance

        Args:
            image: Image result dict
            search_term: Original search term

        Returns:
            Relevance score (0-100)
        """
        score = 50.0  # Base score

        # Prefer square or portrait images (typical for covers)
        width = image.get("width", 0)
        height = image.get("height", 0)
        if width > 0 and height > 0:
            ratio = width / height
            if 0.8 <= ratio <= 1.2:  # Square-ish
                score += 20
            elif ratio < 0.8:  # Portrait
                score += 10

        # Prefer larger images
        if width >= 500 and height >= 500:
            score += 15
        elif width >= 300 and height >= 300:
            score += 10

        # Check title relevance
        title = image.get("title", "").lower()
        search_lower = search_term.lower()

        # Check if key terms are in title
        search_words = set(search_lower.split())
        title_words = set(title.split())
        overlap = len(search_words & title_words)
        score += overlap * 5

        # Penalize very small images
        if width < 200 or height < 200:
            score -= 20

        return min(max(score, 0), 100)
