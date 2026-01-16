#!/usr/bin/env python3
"""
Sync Korean names from JSON file to database
This script runs on startup if korean_names.json exists
"""
import sys
import os
import json
import sqlite3
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def sync_korean_names():
    """Sync Korean names from JSON file to database"""
    # JSON file is in the same directory as this script (scripts/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, 'korean_names.json')

    print(f"Looking for Korean names at: {json_path}")
    if not os.path.exists(json_path):
        print(f"Korean names JSON not found")
        return 0

    # Get database path
    db_path = os.environ.get('DATABASE_PATH', '/app/data/anime.db')
    if not os.path.exists(db_path):
        db_path = os.path.join(script_dir, '..', 'data', 'anime.db')

    print(f"Using database at: {db_path}")

    # Connect directly to SQLite for faster batch operations
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if we already have Korean names in DB
    cursor.execute("SELECT COUNT(*) FROM character WHERE name_korean IS NOT NULL AND name_korean != ''")
    existing_count = cursor.fetchone()[0]

    if existing_count >= 47000:
        print(f"Already have {existing_count} Korean names in DB, skipping sync")
        conn.close()
        return existing_count

    print(f"Loading Korean names from {json_path}...")
    with open(json_path, 'r', encoding='utf-8') as f:
        korean_names = json.load(f)

    print(f"Syncing {len(korean_names)} Korean names to database (using transaction)...")

    # Use single transaction for all updates - MUCH faster!
    try:
        cursor.execute("BEGIN TRANSACTION")

        count = 0
        for char_id, korean_name in korean_names.items():
            cursor.execute(
                "UPDATE character SET name_korean = ? WHERE id = ?",
                (korean_name, int(char_id))
            )
            count += 1

            if count % 10000 == 0:
                print(f"Progress: {count}/{len(korean_names)}")

        cursor.execute("COMMIT")
        print(f"✓ Synced {count} Korean names")

    except Exception as e:
        cursor.execute("ROLLBACK")
        print(f"Error during sync: {e}")
        raise
    finally:
        conn.close()

    return count

if __name__ == "__main__":
    sync_korean_names()
