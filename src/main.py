import os
import argparse
from pathlib import Path

from logic.pipeline import process_frames
from voice.prompts import generate_commentary, speak_text

# --- PROJECT ROOT ---
PROJECT_ROOT = Path(__file__).parent.parent

# --- CONFIG ---
VIDEO_FILE = str(PROJECT_ROOT / "assets" / "videos" / "tennis2.mp4")
OUTPUT_AUDIO_FILE = str(PROJECT_ROOT / "outputs" / "final_commentary.mp3")
OUTPUT_JSON_FILE = str(PROJECT_ROOT / "outputs" / "events.json")
OUTPUT_SCRIPT_FILE = str(PROJECT_ROOT / "outputs" / "commentary_script.txt")
PERSONA = "Energetic, fast-paced tennis commentator like Robbie Koenig"

def main():
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Ball Knowledge - Tennis Commentary Generator")
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Only generate the JSON events (skip Claude and ElevenLabs)"
    )
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help="Generate script but skip audio synthesis (no ElevenLabs)"
    )
    args = parser.parse_args()
    
    print(f"🚀 Starting Pipeline for {VIDEO_FILE}...")
    
    # 1. VIDEO -> JSON (Using your pipeline.py)
    print("\n[1/3] Processing Video Frames...")
    raw_json = process_frames(VIDEO_FILE)
    
    # Save JSON to file
    print(f"   Saving JSON to {OUTPUT_JSON_FILE}...")
    with open(OUTPUT_JSON_FILE, "w") as f:
        f.write(raw_json)
    print(f"   ✅ JSON saved!")
    
    # If json-only flag is set, stop here
    if args.json_only:
        print("\n✅ JSON-ONLY mode: Stopping here.")
        print(f"   JSON output: {os.path.abspath(OUTPUT_JSON_FILE)}")
        return
    
    # 2. JSON -> SCRIPT (Using your prompts.py)
    print("\n[2/3] Generating Commentary Script...")
    script = generate_commentary(raw_json, PERSONA)
    print(f"\n💬 SCRIPT:\n{'-'*20}\n{script}\n{'-'*20}")
    
    # Save script to file
    print(f"\n   Saving script to {OUTPUT_SCRIPT_FILE}...")
    with open(OUTPUT_SCRIPT_FILE, "w") as f:
        f.write(script)
    print(f"   ✅ Script saved!")
    
    # If no-audio flag is set, stop here
    if args.no_audio:
        print("\n✅ NO-AUDIO mode: Skipping audio generation.")
        print(f"   JSON output: {os.path.abspath(OUTPUT_JSON_FILE)}")
        print(f"   Script output: {os.path.abspath(OUTPUT_SCRIPT_FILE)}")
        return
    
    # 3. SCRIPT -> AUDIO (Using your prompts.py)
    print("\n[3/3] Generating Audio...")
    audio_stream = speak_text(script)
    
    # 4. SAVE AUDIO STREAM TO FILE
    print(f"   Saving to {OUTPUT_AUDIO_FILE}...")
    with open(OUTPUT_AUDIO_FILE, "wb") as f:
        for chunk in audio_stream:
            f.write(chunk)
            
    print(f"\n✅ DONE! All outputs saved:")
    print(f"   JSON: {os.path.abspath(OUTPUT_JSON_FILE)}")
    print(f"   Script: {os.path.abspath(OUTPUT_SCRIPT_FILE)}")
    print(f"   Audio: {os.path.abspath(OUTPUT_AUDIO_FILE)}")

if __name__ == "__main__":
    main()