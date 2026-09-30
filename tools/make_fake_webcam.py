"""Make a fake webcam clip (Y4M) for testing hand tracking without a real camera.

Headless Chrome can play this clip as its camera:
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream
  --use-file-for-fake-video-capture=<path>/hand.y4m

The clip pastes a hand from the MediaPipe sample photo onto a dark background, with
+-2 px random shake and light sensor noise per frame. It loops every 10.5 s:
  0.0-1.0  no hand        1.0-5.0  hand held still (center)
  5.0-7.0  slow move right  7.0-7.4  fast swipe left
  7.4-9.0  still (left)   9.0-10.5 no hand

Usage:  pip install numpy pillow && python3 tools/make_fake_webcam.py [out.y4m]
The sample photo is downloaded from Google's MediaPipe asset bucket on first run.
The output is about 140 MB, so don't commit it.
"""
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

PHOTO_URL = "https://storage.googleapis.com/mediapipe-tasks/hand_landmarker/woman_hands.jpg"
HERE = os.path.dirname(os.path.abspath(__file__))
PHOTO = os.path.join(HERE, "woman_hands.jpg")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "hand.y4m")
W, H, FPS = 640, 480, 30

if not os.path.exists(PHOTO):
    urllib.request.urlretrieve(PHOTO_URL, PHOTO)

rng = np.random.default_rng(7)
hand = Image.open(PHOTO).convert("RGB").crop((150, 290, 500, 480)).resize((420, 228))


def pos(t):
    if t < 1.0 or t >= 9.0:
        return None
    if t < 5.0:
        return (110, 130)
    if t < 7.0:
        return (110 + 110 * (t - 5.0) / 2.0, 130)
    if t < 7.4:
        k = (t - 7.0) / 0.4
        return (220 - 200 * k * k * (3 - 2 * k), 130)
    return (20, 130)


def yuv420(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = 0.257 * r + 0.504 * g + 0.098 * b + 16
    u = -0.148 * r - 0.291 * g + 0.439 * b + 128
    v = 0.439 * r - 0.368 * g - 0.071 * b + 128
    u = u.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
    v = v.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
    return b"".join(np.clip(c, 0, 255).astype(np.uint8).tobytes() for c in (y, u, v))


with open(OUT, "wb") as f:
    f.write(f"YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n".encode())
    for i in range(int(10.5 * FPS)):
        img = Image.new("RGB", (W, H), (26, 26, 26))
        p = pos(i / FPS)
        if p:
            jx, jy = rng.uniform(-2, 2, 2)
            img.paste(hand, (int(round(p[0] + jx)), int(round(p[1] + jy))))
        a = np.asarray(img).astype(np.float32) + rng.normal(0, 3, (H, W, 1))
        f.write(b"FRAME\n" + yuv420(a))
print("wrote", OUT)
