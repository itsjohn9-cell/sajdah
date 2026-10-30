#!/usr/bin/env python3
import sys
import cv2
import json
import time
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python import BaseOptions

VIDEO_PATH = sys.argv[1] if len(sys.argv) > 1 else "test/fixtures/videos/prayer_2rakat.mp4"
OUTPUT_PATH = sys.argv[2] if len(sys.argv) > 2 else "test/fixtures/prayer_2rakat_landmarks.json"
MODEL_PATH = "web/vendor/mediapipe/pose_landmarker_lite.task"

print(f"Loading video: {VIDEO_PATH}")
cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print(f"Error: Could not open {VIDEO_PATH}")
    exit(1)

fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps
print(f"Video loaded: {total_frames} frames, {fps} fps, {duration:.1f}s")

options = vision.PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    output_segmentation_masks=False,
    num_poses=2,
)
landmarker = vision.PoseLandmarker.create_from_options(options)

# Sample every 200ms (5 FPS)
step_ms = 200
current_time_ms = 0
extracted_frames = []

t0 = time.time()
print("Extracting landmarks with MediaPipe PoseLandmarker...")

while current_time_ms <= duration * 1000:
    cap.set(cv2.CAP_PROP_POS_MSEC, current_time_ms)
    ret, bgr_frame = cap.read()
    if not ret:
        break

    rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
    result = landmarker.detect(mp_image)

    poses_data = []
    if result.pose_landmarks:
        for pose in result.pose_landmarks:
            landmarks_list = []
            for lm in pose:
                landmarks_list.append({
                    "x": float(lm.x),
                    "y": float(lm.y),
                    "z": float(lm.z),
                    "visibility": float(lm.visibility if lm.visibility is not None else 1.0)
                })
            poses_data.append(landmarks_list)

    extracted_frames.append({
        "timeMs": int(current_time_ms),
        "numPoses": len(poses_data),
        "poses": poses_data
    })

    if len(extracted_frames) % 200 == 0:
        elapsed = time.time() - t0
        print(f"Processed {len(extracted_frames)} frames ({current_time_ms/1000:.1f}s / {duration:.1f}s) in {elapsed:.1f}s...")

    current_time_ms += step_ms

cap.release()
landmarker.close()

with open(OUTPUT_PATH, "w") as f:
    json.dump({
        "video": VIDEO_PATH,
        "durationSeconds": duration,
        "sampleIntervalMs": step_ms,
        "totalFramesExtracted": len(extracted_frames),
        "frames": extracted_frames
    }, f, indent=2)

print(f"Extraction complete! Saved {len(extracted_frames)} frames to {OUTPUT_PATH}")

