import os
import sys
from pathlib import Path
import cv2
import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))




# --- PROJECT ROOT (same pattern as main.py) ---
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# --- IMPORTS (NO src. prefix) ---
from vision.core import VisionSystem
from data.Coord import Coord
from logic.perspective import (
    FrameUnskew,
    TENNIS_COURT_LENGTH,
    TENNIS_COURT_SINGLES_WIDTH,
)

# --- CONFIG ---
VIDEO_PATH = str(PROJECT_ROOT / "assets" / "videos" / "tennis2.mp4")
INTERNAL_HEIGHT = 720
WINDOW_NAME = "Normalization Test"


# --- DRAWING HELPERS ---
def draw_minimap(frame_obj, unskewer, target_height):
    padding = int(target_height * 0.05)
    scale = (target_height - (padding * 2)) / TENNIS_COURT_LENGTH

    map_w = int(TENNIS_COURT_SINGLES_WIDTH * scale) + (padding * 2)
    map_h = target_height
    canvas = np.zeros((map_h, map_w, 3), dtype=np.uint8)

    def to_px(coord: Coord):
        px = padding + int(coord.y * scale)
        py = padding + int(coord.x * scale)
        return (px, py)

    cv2.rectangle(
        canvas,
        to_px(Coord(0, 0)),
        to_px(Coord(TENNIS_COURT_LENGTH, TENNIS_COURT_SINGLES_WIDTH)),
        (200, 200, 200),
        2,
    )

    net_x = TENNIS_COURT_LENGTH / 2
    cv2.line(
        canvas,
        to_px(Coord(net_x, 0)),
        to_px(Coord(net_x, TENNIS_COURT_SINGLES_WIDTH)),
        (100, 100, 100),
        2,
    )

    dot_radius = int(target_height * 0.015)

    if frame_obj:
        if frame_obj.player1 and frame_obj.player1.pos:
            raw = [frame_obj.player1.pos.x, frame_obj.player1.pos.y]
            real = unskewer.unskew_coords_to_coords(raw, height_factor=0.0)
            cv2.circle(canvas, to_px(real), dot_radius, (0, 0, 255), -1)

        if frame_obj.player2 and frame_obj.player2.pos:
            raw = [frame_obj.player2.pos.x, frame_obj.player2.pos.y]
            real = unskewer.unskew_coords_to_coords(raw, height_factor=0.0)
            cv2.circle(canvas, to_px(real), dot_radius, (255, 0, 0), -1)

        if frame_obj.ball and frame_obj.ball.pos:
            raw = [frame_obj.ball.pos.x, frame_obj.ball.pos.y]
            real = unskewer.unskew_coords_to_coords(raw, height_factor=0.0)
            cv2.circle(
                canvas,
                to_px(real),
                int(dot_radius * 0.6),
                (0, 255, 255),
                -1,
            )

    return canvas


def draw_video_overlay(image, frame_obj, frame_count):
    if frame_obj and frame_obj.court:
        c = frame_obj.court
        pts = np.array(
            [
                [c.tl.x, c.tl.y],
                [c.tr.x, c.tr.y],
                [c.br.x, c.br.y],
                [c.bl.x, c.bl.y],
            ],
            np.int32,
        ).reshape((-1, 1, 2))
        cv2.polylines(image, [pts], True, (0, 255, 0), 2)

    font_scale = image.shape[0] / 500.0
    text = f"FRAME: {frame_count}"
    cv2.putText(image, text, (40, 80), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), 8)
    cv2.putText(
        image, text, (40, 80), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 255, 0), 2
    )

    return image


# --- MAIN ---
def main():
    print("🚀 Starting Normalization Test...")

    if not os.path.exists(VIDEO_PATH):
        print("❌ Video not found")
        return

    vision = VisionSystem(VIDEO_PATH)
    cap = cv2.VideoCapture(VIDEO_PATH)

    first = vision.getNextFrame()
    if not first:
        return
    cap.read()

    c = first.court
    corners = [[c.tl.x, c.tl.y], [c.tr.x, c.tr.y], [c.br.x, c.br.y], [c.bl.x, c.bl.y]]
    unskewer = FrameUnskew(corners)

    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)

    frame_count = 0

    while True:
        data = vision.getNextFrame()
        ret, frame = cap.read()

        if not data or not ret:
            break

        frame_count += 1
        frame = draw_video_overlay(frame, data, frame_count)

        h, w = frame.shape[:2]
        frame = cv2.resize(frame, (int(INTERNAL_HEIGHT * w / h), INTERNAL_HEIGHT))

        minimap = draw_minimap(data, unskewer, INTERNAL_HEIGHT)
        cv2.imshow(WINDOW_NAME, np.hstack([frame, minimap]))

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
