"""
TAF (Tonie Audio Format) Parser

Parses TAF file headers to extract metadata:
- audio_id: Unique identifier for the audio content
- hash: SHA1 hash of content
- size: File size in bytes
- tracks: Number of audio tracks
- Cover image (if embedded)

TAF Format Structure:
- Header: 4096 bytes
- Audio data: OGG/Opus format
"""

import struct
import hashlib
import logging
from pathlib import Path
from typing import Dict, Any, Optional, BinaryIO
from io import BytesIO

from PIL import Image

logger = logging.getLogger(__name__)


class TAFParser:
    """Parser for TAF (Tonie Audio Format) files"""

    HEADER_SIZE = 4096
    MAGIC_BYTES = b"TF\x00\x00"  # TAF magic number (may vary)

    def __init__(self, file_path: Optional[str] = None, file_obj: Optional[BinaryIO] = None):
        """
        Initialize parser with either a file path or file object

        Args:
            file_path: Path to TAF file
            file_obj: File-like object containing TAF data
        """
        self.file_path = file_path
        self.file_obj = file_obj
        self.header_data = None
        self.metadata = {}

    def parse(self) -> Dict[str, Any]:
        """
        Parse the TAF file and extract all metadata

        Returns:
            Dictionary containing:
            - audio_id: int
            - hash: str (hex)
            - size: int (bytes)
            - tracks: int
            - confidence: int (0-100, quality indicator)
            - cover_image: bytes (if found)
            - filename: str (original filename)
        """
        try:
            # Read header
            if self.file_path:
                with open(self.file_path, 'rb') as f:
                    self.header_data = f.read(self.HEADER_SIZE)
                    file_size = Path(self.file_path).stat().st_size
            elif self.file_obj:
                self.file_obj.seek(0)
                self.header_data = self.file_obj.read(self.HEADER_SIZE)
                self.file_obj.seek(0, 2)  # Seek to end
                file_size = self.file_obj.tell()
                self.file_obj.seek(0)
            else:
                raise ValueError("Either file_path or file_obj must be provided")

            if len(self.header_data) < self.HEADER_SIZE:
                raise ValueError(f"Invalid TAF file: header too small ({len(self.header_data)} bytes)")

            # Parse header fields
            self.metadata = self._parse_header(self.header_data, file_size)

            # Try to extract cover image
            cover = self._extract_cover()
            if cover:
                self.metadata['cover_image'] = cover

            logger.info(f"Successfully parsed TAF file: {self.metadata.get('audio_id')}")
            return self.metadata

        except Exception as e:
            logger.error(f"Failed to parse TAF file: {e}")
            raise

    def _parse_header(self, header: bytes, file_size: int) -> Dict[str, Any]:
        """
        Parse TAF header bytes to extract metadata

        TAF Header Structure (reverse-engineered):
        Offset  | Size | Description
        --------|------|-------------
        0x0000  | 4    | Magic bytes / Signature
        0x0004  | 4    | Audio ID (uint32, little-endian)
        0x0008  | 20   | SHA1 Hash
        0x001C  | 4    | Track count (uint32)
        0x0020  | 4    | Confidence/Quality (uint32)
        ...     | ...  | Additional metadata

        Note: This is based on reverse engineering and may need adjustment
        """
        metadata = {}

        try:
            # Extract audio ID (offset 0x04, 4 bytes, little-endian uint32)
            audio_id = struct.unpack('<I', header[0x04:0x08])[0]
            metadata['audio_id'] = audio_id

            # Extract hash (offset 0x08, 20 bytes for SHA1)
            hash_bytes = header[0x08:0x1C]
            metadata['hash'] = hash_bytes.hex()

            # Extract track count (offset 0x1C, 4 bytes)
            track_count = struct.unpack('<I', header[0x1C:0x20])[0]
            # Sanity check: track count should be reasonable (1-500)
            if 0 < track_count <= 500:
                metadata['tracks'] = track_count
            else:
                metadata['tracks'] = 0

            # Extract confidence/quality indicator (offset 0x20, 4 bytes)
            confidence = struct.unpack('<I', header[0x20:0x24])[0]
            # Normalize to 0-100 range if it looks like a raw value
            if confidence > 100:
                confidence = min(confidence // 1000, 100)
            metadata['confidence'] = confidence

            # File size
            metadata['size'] = file_size

            # Original filename (if path provided)
            if self.file_path:
                metadata['filename'] = Path(self.file_path).name

            logger.debug(f"Parsed metadata: {metadata}")
            return metadata

        except struct.error as e:
            logger.warning(f"Error parsing header structure: {e}")
            # Fallback: try alternative parsing
            return self._fallback_parse(header, file_size)

    def _fallback_parse(self, header: bytes, file_size: int) -> Dict[str, Any]:
        """
        Fallback parsing method if primary parsing fails.
        Uses heuristics to find likely metadata positions.
        """
        logger.info("Using fallback TAF parsing method")

        metadata = {
            'size': file_size,
            'tracks': 1,  # Assume single track
            'confidence': 0
        }

        # Try to find audio ID by looking for reasonable uint32 values
        # Audio IDs tend to be large positive integers
        for offset in range(0, min(100, len(header) - 4), 4):
            try:
                potential_id = struct.unpack('<I', header[offset:offset+4])[0]
                # Heuristic: audio IDs are typically > 1000000
                if 1000000 < potential_id < 4000000000:
                    metadata['audio_id'] = potential_id
                    logger.debug(f"Found potential audio_id at offset {hex(offset)}: {potential_id}")
                    break
            except:
                continue

        # Try to find hash-like data (20 consecutive bytes with good entropy)
        if 'audio_id' in metadata:
            # Assume hash is near audio_id
            search_start = 4
            for offset in range(search_start, min(200, len(header) - 20)):
                potential_hash = header[offset:offset+20]
                # Check if it looks like a hash (has good byte distribution)
                if self._looks_like_hash(potential_hash):
                    metadata['hash'] = potential_hash.hex()
                    logger.debug(f"Found potential hash at offset {hex(offset)}")
                    break

        if self.file_path:
            metadata['filename'] = Path(self.file_path).name

        return metadata

    def _looks_like_hash(self, data: bytes) -> bool:
        """Check if bytes look like a cryptographic hash"""
        if len(data) != 20:
            return False

        # Good hashes have varied bytes (not all same or sequential)
        unique_bytes = len(set(data))
        return unique_bytes > 10  # At least 10 different byte values

    def _extract_cover(self) -> Optional[bytes]:
        """
        Try to extract cover image from TAF file.
        Looks for embedded JPEG/PNG data after the header.
        """
        try:
            if self.file_path:
                with open(self.file_path, 'rb') as f:
                    f.seek(self.HEADER_SIZE)
                    # Read first 10MB after header to search for images
                    search_data = f.read(10 * 1024 * 1024)
            elif self.file_obj:
                self.file_obj.seek(self.HEADER_SIZE)
                search_data = self.file_obj.read(10 * 1024 * 1024)
                self.file_obj.seek(0)
            else:
                return None

            # Look for JPEG markers
            jpeg_start = search_data.find(b'\xFF\xD8\xFF')
            if jpeg_start != -1:
                # Find JPEG end marker
                jpeg_end = search_data.find(b'\xFF\xD9', jpeg_start)
                if jpeg_end != -1:
                    jpeg_data = search_data[jpeg_start:jpeg_end+2]
                    # Validate it's a real image
                    try:
                        img = Image.open(BytesIO(jpeg_data))
                        img.verify()
                        logger.info(f"Extracted cover image: {img.size}, {img.format}")
                        return jpeg_data
                    except:
                        pass

            # Look for PNG markers
            png_start = search_data.find(b'\x89PNG\r\n\x1a\n')
            if png_start != -1:
                # PNG end marker
                png_end = search_data.find(b'IEND\xaeB`\x82', png_start)
                if png_end != -1:
                    png_data = search_data[png_start:png_end+8]
                    try:
                        img = Image.open(BytesIO(png_data))
                        img.verify()
                        logger.info(f"Extracted cover image: {img.size}, {img.format}")
                        return png_data
                    except:
                        pass

            logger.debug("No cover image found in TAF file")
            return None

        except Exception as e:
            logger.warning(f"Failed to extract cover: {e}")
            return None

    @staticmethod
    def extract_metadata_from_file(file_path: str) -> Dict[str, Any]:
        """
        Convenience method to parse a TAF file

        Args:
            file_path: Path to TAF file

        Returns:
            Metadata dictionary
        """
        parser = TAFParser(file_path=file_path)
        return parser.parse()

    @staticmethod
    def extract_metadata_from_bytes(data: bytes, filename: str = "unknown.taf") -> Dict[str, Any]:
        """
        Convenience method to parse TAF data from bytes

        Args:
            data: TAF file bytes
            filename: Original filename

        Returns:
            Metadata dictionary
        """
        file_obj = BytesIO(data)
        parser = TAFParser(file_obj=file_obj)
        metadata = parser.parse()
        metadata['filename'] = filename
        return metadata
