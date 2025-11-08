"""
Manager for reading and writing tonies.custom.json
"""

import json
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from ..models.schemas import TonieModel, TonieCreateRequest, TonieUpdateRequest

logger = logging.getLogger(__name__)


class ToniesManager:
    """Manages the tonies.custom.json file"""

    def __init__(self, config_path: str = "/data/config"):
        self.config_path = Path(config_path)
        self.tonies_file = self.config_path / "tonies.custom.json"
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        """Create tonies.custom.json if it doesn't exist"""
        if not self.tonies_file.exists():
            logger.info(f"Creating new tonies.custom.json at {self.tonies_file}")
            self.tonies_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.tonies_file, 'w') as f:
                json.dump([], f, indent=2)

    def _backup_file(self):
        """Create a backup of tonies.custom.json"""
        if self.tonies_file.exists():
            backup_path = self.tonies_file.with_suffix(
                f'.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
            )
            backup_path.write_text(self.tonies_file.read_text())
            logger.info(f"Created backup: {backup_path}")

    def get_all_tonies(self) -> List[TonieModel]:
        """
        Read all custom tonies from tonies.custom.json

        Returns:
            List of TonieModel objects
        """
        try:
            # Read from local filesystem
            with open(self.tonies_file, 'r') as f:
                data = json.load(f)

            tonies = [TonieModel(**item) for item in data]
            logger.info(f"Loaded {len(tonies)} custom tonies")
            return tonies

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in tonies.custom.json: {e}")
            return []
        except Exception as e:
            logger.error(f"Failed to read tonies.custom.json: {e}")
            return []

    def get_tonie_by_no(self, no: str) -> Optional[TonieModel]:
        """Get a specific tonie by its 'no' identifier"""
        tonies = self.get_all_tonies()
        for tonie in tonies:
            if tonie.no == no:
                return tonie
        return None

    def get_tonie_by_model(self, model: str) -> Optional[TonieModel]:
        """Get a tonie by its RFID model identifier"""
        tonies = self.get_all_tonies()
        for tonie in tonies:
            if tonie.model == model:
                return tonie
        return None

    def _get_next_no(self) -> str:
        """Get the next available 'no' identifier"""
        tonies = self.get_all_tonies()
        if not tonies:
            return "0"

        # Find the highest 'no' value
        try:
            max_no = max(int(t.no) for t in tonies if t.no.isdigit())
            return str(max_no + 1)
        except (ValueError, AttributeError):
            return str(len(tonies))

    def create_tonie(self, tonie_data: TonieCreateRequest) -> TonieModel:
        """
        Create a new custom tonie entry

        Args:
            tonie_data: Data for the new tonie

        Returns:
            Created TonieModel

        Raises:
            ValueError: If model ID already exists
        """
        # Check if model already exists
        existing = self.get_tonie_by_model(tonie_data.model)
        if existing:
            raise ValueError(f"Tonie with model '{tonie_data.model}' already exists")

        # Load current tonies
        tonies = self.get_all_tonies()

        # Create new tonie
        new_tonie = TonieModel(
            no=self._get_next_no(),
            model=tonie_data.model,
            audio_id=[tonie_data.audio_id],
            hash=[tonie_data.hash],
            title=tonie_data.title or tonie_data.series,
            series=tonie_data.series,
            episodes=tonie_data.episodes,
            tracks=tonie_data.tracks,
            release="0",
            language=tonie_data.language,
            category="custom",
            pic=tonie_data.pic or ""
        )

        # Add to list
        tonies.append(new_tonie)

        # Save
        self._save_tonies(tonies)

        logger.info(f"Created new tonie: {new_tonie.model} (no: {new_tonie.no})")
        return new_tonie

    def update_tonie(self, no: str, update_data: TonieUpdateRequest) -> TonieModel:
        """
        Update an existing tonie

        Args:
            no: Identifier of tonie to update
            update_data: Fields to update

        Returns:
            Updated TonieModel

        Raises:
            ValueError: If tonie not found
        """
        tonies = self.get_all_tonies()

        # Find the tonie
        tonie_index = None
        for i, tonie in enumerate(tonies):
            if tonie.no == no:
                tonie_index = i
                break

        if tonie_index is None:
            raise ValueError(f"Tonie with no '{no}' not found")

        # Update fields
        tonie = tonies[tonie_index]
        update_dict = update_data.model_dump(exclude_unset=True)

        for key, value in update_dict.items():
            if hasattr(tonie, key):
                setattr(tonie, key, value)

        # Save
        self._save_tonies(tonies)

        logger.info(f"Updated tonie: {tonie.model} (no: {no})")
        return tonie

    def delete_tonie(self, no: str) -> bool:
        """
        Delete a tonie

        Args:
            no: Identifier of tonie to delete

        Returns:
            True if deleted, False if not found
        """
        tonies = self.get_all_tonies()

        # Filter out the tonie
        original_count = len(tonies)
        tonies = [t for t in tonies if t.no != no]

        if len(tonies) == original_count:
            logger.warning(f"Tonie with no '{no}' not found for deletion")
            return False

        # Save
        self._save_tonies(tonies)

        logger.info(f"Deleted tonie no: {no}")
        return True

    def _save_tonies(self, tonies: List[TonieModel]):
        """
        Save tonies list to tonies.custom.json

        Args:
            tonies: List of TonieModel objects to save
        """
        # Create backup before saving
        self._backup_file()

        # Convert to dict and save
        data = [tonie.model_dump() for tonie in tonies]
        json_content = json.dumps(data, indent=2, ensure_ascii=False)

        # Write to local filesystem
        with open(self.tonies_file, 'w') as f:
            f.write(json_content)

        logger.info(f"Saved {len(tonies)} tonies to {self.tonies_file}")

    def reload_teddycloud_config(self, teddycloud_url: str) -> bool:
        """
        Trigger TeddyCloud to reload its configuration

        Args:
            teddycloud_url: Base URL of TeddyCloud instance

        Returns:
            True if successful
        """
        import httpx

        try:
            # TeddyCloud doesn't have a dedicated reload endpoint yet
            # But we can trigger a settings read which may reload the config
            # For now, just log that we would trigger a reload
            logger.info("Would trigger TeddyCloud config reload (not yet implemented)")
            # TODO: Implement when API becomes available
            return True

        except Exception as e:
            logger.error(f"Failed to reload TeddyCloud config: {e}")
            return False
