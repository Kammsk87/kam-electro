from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "private-stable-hall-material-sample-board.png"

DL = Path("/Users/aleksandr/Downloads")
SOURCES = {
    "hero": DL / "photo_2026-07-12 23.38.55.jpeg",
    "stone": DL / "photo_2026-07-12 23.38.57.jpeg",
    "light_oak": DL / "photo_2026-07-12 23.39.07.jpeg",
    "dark_wood": DL / "photo_2026-07-12 23.38.53.jpeg",
    "live_edge": DL / "photo_2026-07-12 23.39.04.jpeg",
    "bronze": DL / "photo_2026-07-12 23.38.51.jpeg",
    "linen": DL / "photo_2026-07-12 23.39.07.jpeg",
    "black_metal": DL / "photo_2026-07-12 23.38.55.jpeg",
    "leather": DL / "photo_2026-07-12 23.39.04.jpeg",
}

FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def crop(path, box=None):
    im = Image.open(path).convert("RGB")
    if box:
        im = im.crop(box)
    im = ImageEnhance.Color(im).enhance(0.9)
    im = ImageEnhance.Contrast(im).enhance(1.03)
    im = ImageEnhance.Brightness(im).enhance(0.98)
    return im


def cover(im, w, h):
    scale = max(w / im.width, h / im.height)
    nw, nh = round(im.width * scale), round(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return im.crop((left, top, left + w, top + h))


def shadow(canvas, xy, size, radius=18):
    x, y = xy
    w, h = size
    sh = Image.new("RGBA", (w + 44, h + 44), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    d.rounded_rectangle((22, 22, w + 22, h + 22), radius=radius, fill=(35, 24, 15, 62))
    sh = sh.filter(ImageFilter.GaussianBlur(16))
    canvas.alpha_composite(sh, (x - 22, y - 16))


def paste_image(canvas, im, x, y, w, h):
    shadow(canvas, (x, y), (w, h), 12)
    tile = cover(im, w, h)
    canvas.paste(tile, (x, y))


def swatch(canvas, draw, title, subtitle, im, x, y, w, h):
    paste_image(canvas, im, x, y, w, h)
    draw.text((x, y + h + 18), title, fill=(54, 39, 26), font=font(30, True))
    if subtitle:
        draw.text((x, y + h + 56), subtitle, fill=(106, 83, 61), font=font(21))


def color_chip(draw, x, y, color, label):
    draw.ellipse((x, y, x + 84, y + 84), fill=color)
    draw.ellipse((x, y, x + 84, y + 84), outline=(210, 198, 181), width=2)
    draw.text((x - 8, y + 102), label, fill=(78, 58, 39), font=font(20))


def main():
    W, H = 2400, 1350
    canvas = Image.new("RGBA", (W, H), (232, 222, 207, 255))
    draw = ImageDraw.Draw(canvas)

    # Warm paper grain.
    grain = Image.effect_noise((W, H), 14).convert("L")
    grain = ImageEnhance.Contrast(grain).enhance(0.18)
    canvas.alpha_composite(Image.merge("RGBA", (grain, grain, grain, grain)).point(lambda p: min(p, 18)))

    draw.text((84, 58), "Sample board", fill=(54, 39, 26), font=font(54, True))
    draw.text((86, 124), "Холл частной конюшни · материалы из интерьерного решения", fill=(103, 78, 54), font=font(28))

    hero = crop(SOURCES["hero"])
    paste_image(canvas, hero, 84, 190, 900, 745)
    draw.text((84, 970), "Атмосфера", fill=(54, 39, 26), font=font(34, True))
    draw.text((84, 1016), "теплый камень · дерево · огонь · мягкая группа", fill=(103, 78, 54), font=font(24))

    crops = {
        "stone": crop(SOURCES["stone"], (475, 160, 850, 1110)),
        "light_oak": crop(SOURCES["light_oak"], (120, 0, 970, 360)),
        "dark_wood": crop(SOURCES["dark_wood"], (0, 280, 310, 920)),
        "live_edge": crop(SOURCES["live_edge"], (300, 570, 950, 805)),
        "bronze": crop(SOURCES["bronze"], (320, 360, 690, 600)),
        "linen": crop(SOURCES["linen"], (0, 1030, 1024, 1278)),
        "black_metal": crop(SOURCES["black_metal"], (0, 210, 430, 810)),
        "leather": crop(SOURCES["leather"], (360, 690, 1160, 940)),
    }

    x0, y0 = 1060, 190
    cw, ch = 360, 165
    gx, gy = 40, 98
    items = [
        ("Колотый камень", "стены / лестница / масса", crops["stone"]),
        ("Светлый дуб", "потолок / балки / тепло", crops["light_oak"]),
        ("Тёплый шпон", "панели / шкафы / двери", crops["dark_wood"]),
        ("Живой край", "столешницы / ручная работа", crops["live_edge"]),
        ("Бронза / медь", "свет / фурнитура / акцент", crops["bronze"]),
        ("Лён и шерсть", "диваны / подушки / тактильность", crops["linen"]),
        ("Чёрный металл", "стекло / камин / профиль", crops["black_metal"]),
        ("Коньячная кожа", "кресла / седельный оттенок", crops["leather"]),
    ]

    for i, (title, subtitle, im) in enumerate(items):
        col = i % 3
        row = i // 3
        swatch(canvas, draw, title, subtitle, im, x0 + col * (cw + gx), y0 + row * (ch + gy), cw, ch)

    # Color palette strip.
    palette_y = 1128
    draw.text((84, palette_y), "Палитра", fill=(54, 39, 26), font=font(32, True))
    chips = [
        ((210, 176, 132), "дуб"),
        ((142, 82, 42), "орех"),
        ((176, 112, 55), "кожа"),
        ((188, 142, 80), "бронза"),
        ((163, 150, 130), "камень"),
        ((46, 42, 37), "металл"),
        ((222, 207, 185), "лён"),
    ]
    for i, (color, label) in enumerate(chips):
        color_chip(draw, 200 + i * 118, palette_y - 4, color, label)

    note_x = 1060
    draw.rounded_rectangle((note_x, 1035, 2315, 1260), radius=16, fill=(218, 203, 184), outline=(198, 181, 160), width=1)
    draw.text((note_x + 34, 1063), "Ключевое ощущение", fill=(54, 39, 26), font=font(28, True))
    draw.text(
        (note_x + 34, 1107),
        "клубная конюшня: ремесленная, тёплая, сдержанная,\nс фактурой седельной и уровнем частного холла",
        fill=(91, 67, 45),
        font=font(24),
        spacing=8,
    )

    canvas.convert("RGB").save(OUT, quality=96)


if __name__ == "__main__":
    main()
