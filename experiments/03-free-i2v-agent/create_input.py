#!/usr/bin/env python3
"""Create deterministic original still for a single engineering integration test."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "assets" / "input.png"
OUT.parent.mkdir(parents=True, exist_ok=True)
im = Image.new("RGB", (512, 768))
draw = ImageDraw.Draw(im)
for y in range(768):
    t = y / 768
    draw.line([(0, y), (512, y)], fill=(int(28 + 125 * t), int(47 + 100 * t), int(100 - 45 * t)))
draw.ellipse((310, 115, 415, 220), fill=(255, 197, 116))
draw.polygon([(0, 600), (130, 500), (260, 590), (400, 515), (512, 570), (512, 768), (0, 768)], fill=(26, 58, 65))
draw.polygon([(256, 210), (205, 355), (307, 355)], fill=(210, 59, 62))
draw.rounded_rectangle((212, 341, 300, 562), radius=20, fill=(233, 235, 232), outline=(37, 41, 49), width=4)
draw.ellipse((236, 393, 276, 433), fill=(52, 140, 183))
draw.polygon([(213, 487), (176, 572), (213, 545)], fill=(221, 62, 66))
draw.polygon([(299, 487), (336, 572), (299, 545)], fill=(221, 62, 66))
im.save(OUT)
print("Created original integration-test still:", OUT)
