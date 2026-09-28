#!/usr/bin/env python3
"""
Generate the full PWA icon set from public/logo-180x180.png (Jana's new mark).

Cream background #f4f2f0 (--bg-primary).
For maskable icons, the logo is scaled to fit inside the inner 80% safe area
so the arc isn't clipped by Android launchers that apply circular masks.
"""
from PIL import Image, ImageDraw
from pathlib import Path

PUBLIC = Path("public")
SRC = PUBLIC / "logo-180x180.png"

CREAM = (244, 242, 240, 255)  # #f4f2f0

def composite_on_cream(src_img: Image.Image, size: int, safe_area: float = 1.0) -> Image.Image:
    """Composite src onto a cream square of `size`x`size`.
    If safe_area < 1, src is scaled to fit inside that fraction of the canvas
    (e.g. 0.8 = inner 80% maskable safe area, centered).
    """
    canvas = Image.new("RGBA", (size, size), CREAM)
    target = int(round(size * safe_area))
    if target != src_img.width:
        logo = src_img.resize((target, target), Image.LANCZOS)
    else:
        logo = src_img
    offset = ((size - target) // 2, (size - target) // 2)
    canvas.alpha_composite(logo, offset)
    return canvas

def save_ico(png_paths_sizes, out_path):
    """Build an ICO file from a list of (path, size) tuples.

    PIL's ICO writer embeds the base image at its native size plus any
    explicit sizes in the `sizes` kwarg, plus everything in `append_images`.
    The cleanest pattern is: pass the *largest* image as base, list all
    wanted sizes, and append the smaller ones (so the base is only used at
    its native resolution and the others are resampled into the listed
    sizes)."""
    images = [(p, Image.open(p).convert("RGBA")) for p, _ in png_paths_sizes]
    images.sort(key=lambda kv: -kv[1].width)  # largest first
    base_path, base_img = images[0]
    sizes = [(img.width, img.height) for _, img in images]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    base_img.save(
        out_path,
        format="ICO",
        sizes=sizes,
        append_images=[img for _, img in images[1:]],
    )

def main():
    src = Image.open(SRC).convert("RGBA")
    assert src.size == (180, 180), f"unexpected source size {src.size}"

    # 1) Favicon PNGs (cream bg, full logo)
    for sz in (16, 32, 48):
        img = composite_on_cream(src, sz)
        img.save(PUBLIC / f"favicon-{sz}x{sz}.png")

    # 2) apple-touch-icon (180, cream bg, full logo — iOS rounds corners itself)
    composite_on_cream(src, 180).save(PUBLIC / "apple-touch-icon.png")

    # 3) PWA standard icons (192, 512, cream bg, full logo)
    composite_on_cream(src, 192).save(PUBLIC / "icon-192.png")
    composite_on_cream(src, 512).save(PUBLIC / "icon-512.png")

    # 4) Maskable icons (logo inside inner 80% so the arc isn't clipped by masks)
    composite_on_cream(src, 192, safe_area=0.8).save(PUBLIC / "icon-maskable-192.png")
    composite_on_cream(src, 512, safe_area=0.8).save(PUBLIC / "icon-maskable-512.png")

    # 5) Microsoft tile (150, full logo)
    composite_on_cream(src, 150).save(PUBLIC / "mstile-150x150.png")

    # 6) favicon.ico — multi-size (16, 32, 48)
    save_ico(
        [
            (PUBLIC / "favicon-16x16.png", 16),
            (PUBLIC / "favicon-32x32.png", 32),
            (PUBLIC / "favicon-48x48.png", 48),
        ],
        PUBLIC / "favicon.ico",
    )

    print("Generated:")
    for p in sorted(PUBLIC.glob("favicon*")) + sorted(PUBLIC.glob("icon*")) + \
             sorted(PUBLIC.glob("apple*")) + sorted(PUBLIC.glob("mstile*")):
        if p.suffix in {".png", ".ico"}:
            print(f"  {p.name:35s}  {p.stat().st_size:>7d} bytes")

if __name__ == "__main__":
    main()
