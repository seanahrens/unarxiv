#!/bin/bash
# Double-click this file on macOS to run tex_to_audio in batch mode.
# It will convert any new .tex files in the input/ folder and save MP3s to output/.

# Change to the folder this script lives in so relative paths work correctly
cd "$(dirname "$0")"

# Run the converter
python3 tex_to_audio.py

# Keep the window open so you can read any errors (the script does this too,
# but this is a belt-and-suspenders fallback)
