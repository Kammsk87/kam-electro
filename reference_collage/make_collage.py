from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw


ROOT = Path(__file__).resolve().parent
IMG = ROOT / "reference_images"
OUT = ROOT / "private-stable-hall-mood-collage.png"


def open_rgb(path):
    im = Image.open(path).convert("RGB")
    im = ImageEnhance.Color(im).enhance(0.92)
    im = ImageEnhance.Contrast(im).enhance(1.04)
    return im


def cover(im, w, h):
    src_w, src_h = im.size
    scale = max(w / src_w, h / src_h)
    new_size = (round(src_w * scale), round(src_h * scale))
    im = im.resize(new_size, Image.Resampling.LANCZOS)
    left = (im.width - w) // 2
    top = (im.height - h) // 2
    return im.crop((left, top, left + w, top + h))


def paste_card(canvas, im, box, radius=0):
    x, y, w, h = box
    tile = cover(im, w, h)
    shadow = Image.new("RGBA", (w + 28, h + 28), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((14, 14, w + 14, h + 14), radius=radius, fill=(0, 0, 0, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    canvas.alpha_composite(shadow, (x - 14, y - 10))
    canvas.paste(tile, (x, y))


def main():
    canvas = Image.new("RGBA", (2400, 1350), (31, 24, 18, 255))

    files = {
        "lounge": "beechwood-03.jpg",
        "timber": "beechwood-05.jpg",
        "stable_detail": "beechwood-08.jpg",
        "tack_room": "decorators-equestrian.jpg",
        "oak_tack": "sebo-tackroom-01.jpg",
        "workshop": "robhammer-workshop.jpg",
        "leather": "robhammer-leather-detail.jpg",
        "people": "unsplash-stable-people.jpg",
        "bronze_handle": "custom-castings-handle.jpg",
        "riverstone": "custom-castings-riverstone-handle.jpg",
    }
    images = {name: open_rgb(IMG / file) for name, file in files.items()}

    layout = [
        ("people", (60, 60, 560, 610)),
        ("lounge", (642, 60, 820, 430)),
        ("tack_room", (1484, 60, 856, 430)),
        ("workshop", (60, 692, 560, 598)),
        ("oak_tack", (642, 512, 560, 360)),
        ("leather", (1224, 512, 238, 360)),
        ("timber", (1484, 512, 410, 360)),
        ("bronze_handle", (1916, 512, 424, 360)),
        ("riverstone", (642, 894, 390, 396)),
        ("stable_detail", (1054, 894, 1286, 396)),
    ]

    for name, box in layout:
        paste_card(canvas, images[name], box)

    # Subtle vignette to make the board feel cohesive on a slide.
    vignette = Image.new("L", canvas.size, 0)
    draw = ImageDraw.Draw(vignette)
    draw.ellipse((-350, -260, 2750, 1660), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(120))
    dark = Image.new("RGBA", canvas.size, (0, 0, 0, 80))
    canvas = Image.composite(canvas, Image.alpha_composite(canvas, dark), vignette)

    canvas.convert("RGB").save(OUT, quality=95)


if __name__ == "__main__":
    main()
