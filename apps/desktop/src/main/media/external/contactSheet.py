#!/usr/bin/env python3
"""
contactSheet.py — Fast PIL contact sheet generator for candidate thumbnails.
Stitches 2 to 6 candidate images into a labeled grid with numbered badges [1]..[N].
Runs in ~10ms.
"""

import json
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont

def create_contact_sheet(image_paths: list[str], output_path: str, thumb_size: int = 256) -> str:
    n = len(image_paths)
    if n == 0:
        raise ValueError("No images provided for contact sheet")

    cols = 2 if n <= 4 else 3
    rows = math.ceil(n / cols)

    grid_w = cols * thumb_size
    grid_h = rows * thumb_size
    sheet = Image.new("RGB", (grid_w, grid_h), color=(20, 20, 20))
    draw = ImageDraw.Draw(sheet)

    for idx, path in enumerate(image_paths):
        c = idx % cols
        r = idx // cols
        x = c * thumb_size
        y = r * thumb_size

        try:
            if os.path.isfile(path):
                with Image.open(path) as img:
                    img_rgb = img.convert("RGB")
                    # Fit within thumb_size with aspect ratio preserved
                    img_rgb.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
                    # Center thumbnail in cell
                    offset_x = x + (thumb_size - img_rgb.width) // 2
                    offset_y = y + (thumb_size - img_rgb.height) // 2
                    sheet.paste(img_rgb, (offset_x, offset_y))
            else:
                draw.rectangle([x, y, x + thumb_size, y + thumb_size], fill=(40, 40, 40))
        except Exception:
            draw.rectangle([x, y, x + thumb_size, y + thumb_size], fill=(50, 20, 20))

        # Cell border
        draw.rectangle([x, y, x + thumb_size - 1, y + thumb_size - 1], outline=(60, 60, 60), width=1)

        # Draw numbered badge in top-left of cell: [1], [2], etc.
        badge_w, badge_h = 36, 28
        bx, by = x + 8, y + 8
        draw.rectangle([bx, by, bx + badge_w, by + badge_h], fill=(0, 0, 0))
        draw.rectangle([bx, by, bx + badge_w, by + badge_h], outline=(255, 255, 255), width=2)
        label = f"[{idx + 1}]"
        draw.text((bx + 6, by + 6), label, fill=(255, 255, 255))

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    sheet.save(output_path, quality=85)
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: contactSheet.py <output_path> <image_path1> [image_path2...]", file=sys.stderr)
        sys.exit(1)
    out = sys.argv[1]
    inputs = sys.argv[2:]
    create_contact_sheet(inputs, out)
    print(out)
