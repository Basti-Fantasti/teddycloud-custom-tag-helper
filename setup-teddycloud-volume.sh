#!/bin/bash
#
# Setup script to populate teddycloud-data volume
# This copies TeddyCloud data from SMB share to Docker volume
#

set -e

echo "========================================="
echo "TeddyCloud Volume Setup"
echo "========================================="
echo

# Check if SMB share is mounted
if [ ! -d "/Volumes/docker-appdata/teddycloud" ]; then
    echo "ERROR: SMB share not mounted at /Volumes/docker-appdata/teddycloud"
    echo
    echo "Please mount the SMB share first:"
    echo "  mkdir -p /Volumes/docker-appdata"
    echo "  mount_smbfs //guest@docker/docker-appdata /Volumes/docker-appdata"
    echo
    exit 1
fi

# Create temp container to access volume
echo "Creating temporary container to access volume..."
docker run --rm \
    -v teddycloud-custom-tonie-manager_teddycloud-data:/data \
    -v /Volumes/docker-appdata/teddycloud:/source:ro \
    alpine sh -c '
        echo "Copying TeddyCloud data to volume..."
        echo "  - config/"
        cp -r /source/config/* /data/ 2>/dev/null || mkdir -p /data/config

        echo "  - library/"
        mkdir -p /data/library
        cp -r /source/library/* /data/library/ 2>/dev/null || true

        echo "  - content/"
        mkdir -p /data/content
        cp -r /source/content/* /data/content/ 2>/dev/null || true

        echo "Done!"
        echo
        echo "Volume contents:"
        ls -la /data/
    '

echo
echo "========================================="
echo "Setup complete!"
echo "========================================="
echo
echo "Now restart the backend:"
echo "  docker-compose restart backend"
echo
