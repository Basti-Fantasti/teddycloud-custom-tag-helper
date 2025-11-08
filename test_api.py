#!/usr/bin/env python3
"""Test script to check TeddyCloud API responses"""

import httpx
import json

TEDDYCLOUD_URL = "http://docker"

async def test_api():
    async with httpx.AsyncClient(timeout=10) as client:
        print("=" * 60)
        print("Testing TeddyCloud API")
        print("=" * 60)

        # Test base URL
        try:
            print(f"\n1. Testing base URL: {TEDDYCLOUD_URL}")
            response = await client.get(TEDDYCLOUD_URL)
            print(f"   Status: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('content-type')}")
            print(f"   Content length: {len(response.content)} bytes")
        except Exception as e:
            print(f"   ERROR: {e}")

        # Test toniesCustomJson
        try:
            url = f"{TEDDYCLOUD_URL}/api/toniesCustomJson"
            print(f"\n2. Testing: {url}")
            response = await client.get(url)
            print(f"   Status: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('content-type')}")
            print(f"   Content length: {len(response.content)} bytes")
            print(f"   Raw content: {response.content[:200]}")
            if response.content:
                try:
                    data = response.json()
                    print(f"   Parsed JSON: {type(data)}")
                    if isinstance(data, list):
                        print(f"   Items: {len(data)}")
                except:
                    print(f"   Failed to parse as JSON")
        except Exception as e:
            print(f"   ERROR: {e}")

        # Test fileIndexV2
        try:
            url = f"{TEDDYCLOUD_URL}/api/fileIndexV2"
            print(f"\n3. Testing: {url}")
            response = await client.get(url)
            print(f"   Status: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('content-type')}")
            print(f"   Content length: {len(response.content)} bytes")
            print(f"   Raw content: {response.content[:200]}")
            if response.content:
                try:
                    data = response.json()
                    print(f"   Parsed JSON: {type(data)}")
                    print(f"   Keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
                except:
                    print(f"   Failed to parse as JSON")
        except Exception as e:
            print(f"   ERROR: {e}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_api())
