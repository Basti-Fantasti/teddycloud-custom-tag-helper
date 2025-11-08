"""
API routes for serving images from TeddyCloud
Proxies images so they can be displayed in the frontend
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
import httpx

from ..config import get_settings, Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/images", tags=["images"])


@router.get("/{path:path}")
async def get_image(path: str, settings: Settings = Depends(get_settings)):
    """
    Serve images from local TeddyCloud volume or proxy from TeddyCloud server

    Args:
        path: Image path (e.g., library/own/pics/wilma-wolkenkopf.jpg)

    Returns:
        Image content
    """
    try:
        from pathlib import Path
        import mimetypes

        # Clean up path
        if path.startswith("/"):
            path = path[1:]

        # Try to serve from local filesystem first
        image_path = Path(settings.volumes.data_path) / path

        if image_path.exists() and image_path.is_file():
                logger.info(f"Serving image from local filesystem: {image_path}")

                # Read file
                with open(image_path, "rb") as f:
                    content = f.read()

                # Determine content type
                content_type, _ = mimetypes.guess_type(str(image_path))
                if not content_type:
                    content_type = "image/jpeg"

                return Response(
                    content=content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=3600",
                    }
                )

        # Fallback: fetch from TeddyCloud HTTP
        base_url = settings.teddycloud.url
        if base_url.endswith("/web"):
            base_url = base_url[:-4]

        image_url = f"{base_url}/{path}"
        logger.info(f"Fetching image from TeddyCloud: {image_url}")

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(image_url)

            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Image not found")

            response.raise_for_status()

            content_type = response.headers.get("content-type", "image/jpeg")

            return Response(
                content=response.content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=3600",
                }
            )

    except FileNotFoundError:
        logger.error(f"Image not found: {path}")
        raise HTTPException(status_code=404, detail="Image not found")
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching image: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to fetch image: {e}")
        raise HTTPException(status_code=500, detail=str(e))
