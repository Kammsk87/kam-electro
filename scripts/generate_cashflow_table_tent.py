from __future__ import annotations

import math
import random
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
OUT_FILE = OUT_DIR / "cashflow196_quiz_team_table_tent_a4.pdf"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"


def hex_color(value: str) -> colors.Color:
    return colors.HexColor(value)


INK = hex_color("#080909")
INK_SOFT = hex_color("#111412")
GOLD = hex_color("#c49136")
GOLD_DARK = hex_color("#8c641d")
GOLD_LIGHT = hex_color("#f1d086")
CREAM = hex_color("#fbf7ed")
WHITE = hex_color("#ffffff")
FOLD = hex_color("#777777")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("CashflowRegular", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("CashflowBold", FONT_BOLD))
    pdfmetrics.registerFont(TTFont("CashflowBlack", FONT_BLACK))


def centered_text(c: canvas.Canvas, text: str, x: float, y: float, font: str, size: float, fill: colors.Color) -> None:
    c.setFont(font, size)
    c.setFillColor(fill)
    c.drawCentredString(x, y, text)


def fit_centered_text(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font: str,
    size: float,
    fill: colors.Color,
    min_size: float = 8,
) -> None:
    actual = size
    while actual > min_size and pdfmetrics.stringWidth(text, font, actual) > max_width:
        actual -= 0.5
    centered_text(c, text, x, y, font, actual, fill)


def draw_corner(c: canvas.Canvas, x: float, y: float, sx: int, sy: int) -> None:
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.line(x, y + sy * 32, x, y + sy * 7)
    c.line(x + sx * 7, y, x + sx * 32, y)
    c.line(x + sx * 32, y, x + sx * 42, y + sy * 10)
    c.line(x, y + sy * 32, x + sx * 10, y + sy * 42)


def draw_star(c: canvas.Canvas, x: float, y: float, r: float = 10) -> None:
    c.setFillColor(GOLD_LIGHT)
    path = c.beginPath()
    path.moveTo(x, y + r * 1.45)
    path.curveTo(x + r * 0.18, y + r * 0.4, x + r * 0.4, y + r * 0.18, x + r * 1.45, y)
    path.curveTo(x + r * 0.4, y - r * 0.18, x + r * 0.18, y - r * 0.4, x, y - r * 1.45)
    path.curveTo(x - r * 0.18, y - r * 0.4, x - r * 0.4, y - r * 0.18, x - r * 1.45, y)
    path.curveTo(x - r * 0.4, y + r * 0.18, x - r * 0.18, y + r * 0.4, x, y + r * 1.45)
    c.drawPath(path, fill=1, stroke=0)


def draw_brain_mark(c: canvas.Canvas, x: float, y: float, radius: float = 15) -> None:
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.2)
    c.circle(x, y, radius, stroke=1, fill=0)
    c.setLineWidth(0.9)
    for side in (-1, 1):
        c.bezier(x, y - 9, x + side * 12, y - 7, x + side * 12, y + 8, x + side * 2, y + 9)
        c.bezier(x + side * 2, y + 9, x + side * 4, y + 2, x + side * 12, y + 3, x + side * 7, y - 3)
        c.bezier(x + side * 1, y - 5, x + side * 6, y - 3, x + side * 6, y + 3, x + side * 1, y + 2)


def clip_panel(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    path = c.beginPath()
    path.rect(x, y, w, h)
    c.clipPath(path, stroke=0, fill=0)


def draw_texture(c: canvas.Canvas, x: float, y: float, w: float, h: float, seed: int) -> None:
    rnd = random.Random(seed)
    c.saveState()
    clip_panel(c, x, y, w, h)
    c.setStrokeColor(GOLD_DARK)
    c.setLineWidth(0.25)
    c.setStrokeAlpha(0.28)
    for _ in range(72):
        x1 = x + rnd.random() * w
        y1 = y + rnd.random() * h
        steps = rnd.randint(2, 4)
        prev_x, prev_y = x1, y1
        for _ in range(steps):
            nx = prev_x + rnd.uniform(-42, 42)
            ny = prev_y + rnd.uniform(-28, 28)
            c.line(prev_x, prev_y, nx, ny)
            prev_x, prev_y = nx, ny
    c.setFillColor(GOLD_LIGHT)
    c.setFillAlpha(0.14)
    for _ in range(95):
        px = x + rnd.random() * w
        py = y + rnd.random() * h
        c.circle(px, py, rnd.uniform(0.35, 1.2), stroke=0, fill=1)
    c.restoreState()
    c.setStrokeAlpha(1)
    c.setFillAlpha(1)


def draw_question_mark(c: canvas.Canvas, x: float, y: float, size: float, side: str) -> None:
    c.saveState()
    c.setFont("CashflowBlack", size)
    c.setFillColor(GOLD_DARK)
    c.setFillAlpha(0.35)
    c.drawString(x + 2.5, y - 2.5, "?")
    c.setFillColor(GOLD_LIGHT)
    c.setFillAlpha(0.92)
    c.drawString(x, y, "?")
    c.setFillAlpha(1)

    rnd = random.Random(196 if side == "right" else 691)
    cx = x + size * 0.28
    cy = y + size * 0.47
    c.setStrokeColor(WHITE)
    c.setFillColor(WHITE)
    c.setStrokeAlpha(0.35)
    c.setFillAlpha(0.75)
    points: list[tuple[float, float]] = []
    for i in range(34):
        angle = i / 34 * math.tau * 0.78 + 0.3
        r = size * (0.16 + rnd.random() * 0.17)
        points.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
    for idx, point in enumerate(points[:-1]):
        if idx % 2 == 0:
            c.line(point[0], point[1], points[idx + 1][0], points[idx + 1][1])
    for px, py in points[::2]:
        c.circle(px, py, 1.0, stroke=0, fill=1)
    c.restoreState()
    c.setStrokeAlpha(1)
    c.setFillAlpha(1)


def draw_brand_box(c: canvas.Canvas, x: float, y: float, scale: float = 1.0) -> None:
    w = 93 * scale
    h = 21 * scale
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.rect(x, y, w, h, stroke=1, fill=0)
    c.setFont("CashflowRegular", 11.5 * scale)
    c.setFillColor(GOLD_LIGHT)
    c.drawCentredString(x + w / 2, y + 6.2 * scale, "CASHFLOW196")
    c.setFont("CashflowBold", 5.8 * scale)
    c.setFillColor(GOLD)
    c.drawCentredString(x + w / 2, y - 9 * scale, "БИЗНЕС-СООБЩЕСТВО")


def draw_panel(c: canvas.Canvas, x: float, y: float, w: float, h: float, *, rotate: bool, seed: int) -> None:
    c.saveState()
    if rotate:
        c.translate(x + w / 2, y + h / 2)
        c.rotate(180)
        c.translate(-x - w / 2, -y - h / 2)

    c.setFillColor(INK)
    c.rect(x, y, w, h, fill=1, stroke=0)
    c.setFillColor(INK_SOFT)
    c.rect(x + 9, y + 14, w - 18, h - 28, fill=1, stroke=0)
    draw_texture(c, x + 9, y + 14, w - 18, h - 28, seed)

    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.rect(x + 17, y + 22, w - 34, h - 44, stroke=1, fill=0)
    c.setStrokeColor(GOLD_DARK)
    c.setLineWidth(0.45)
    c.rect(x + 21, y + 26, w - 42, h - 52, stroke=1, fill=0)
    draw_corner(c, x + 19, y + 24, 1, 1)
    draw_corner(c, x + w - 19, y + 24, -1, 1)
    draw_corner(c, x + 19, y + h - 24, 1, -1)
    draw_corner(c, x + w - 19, y + h - 24, -1, -1)

    draw_question_mark(c, x + w - 140, y + 18, 154, "right")

    field_x = x + 108
    field_y = y + 59
    field_w = w - 216
    field_h = 68
    c.setFillColor(CREAM)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.05)
    c.roundRect(field_x, field_y, field_w, field_h, 23, stroke=1, fill=1)
    c.setStrokeColor(hex_color("#e4d7bd"))
    c.setLineWidth(0.45)
    c.setDash(2, 6)
    c.line(field_x + 42, field_y + field_h / 2, field_x + field_w - 42, field_y + field_h / 2)
    c.setDash()

    c.setFont("CashflowBold", 11)
    c.setFillColor(WHITE)
    c.drawString(x + 88, y + h - 54, "QUIZ")
    c.setFont("CashflowBlack", 28)
    c.setFillColor(GOLD_LIGHT)
    c.drawString(x + 48, y + h - 78, "CASHFLOW")
    c.setFont("CashflowBold", 10)
    c.setFillColor(WHITE)
    c.drawString(x + 82, y + h - 91, "НЕ ПРОСТО КВИЗ")

    title_y = y + h - 70
    draw_star(c, x + w / 2 - 155, title_y + 5, 8.5)
    draw_star(c, x + w / 2 + 155, title_y + 5, 8.5)
    c.setStrokeColor(GOLD_DARK)
    c.setLineWidth(0.8)
    c.line(x + w / 2 - 136, title_y + 5, x + w / 2 - 54, title_y + 5)
    c.line(x + w / 2 + 54, title_y + 5, x + w / 2 + 136, title_y + 5)
    centered_text(c, "КОМАНДА", x + w / 2, title_y - 5, "CashflowBlack", 28, GOLD_LIGHT)

    draw_brain_mark(c, x + 82, y + 45, 14)
    c.setFont("CashflowBold", 9.5)
    c.setFillColor(GOLD)
    c.drawString(x + 108, y + 46, "ДУМАЙ. ОБСУЖДАЙ. ПОБЕЖДАЙ.")
    c.setFont("CashflowRegular", 10)
    c.setFillColor(WHITE)
    c.drawString(x + 108, y + 30, "#QUIZCASHFLOW")
    draw_brand_box(c, x + w - 248, y + 38, 0.85)

    c.restoreState()


def draw_fold_line(c: canvas.Canvas, w: float, y: float) -> None:
    c.setStrokeColor(FOLD)
    c.setLineWidth(1.0)
    c.setDash(6, 6)
    c.line(28, y, w - 28, y)
    c.setDash()
    c.setFont("CashflowRegular", 6.5)
    c.setFillColor(FOLD)
    c.drawRightString(w - 31, y + 7, "ЛИНИЯ СГИБА")


def build() -> None:
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    page_w, page_h = landscape(A4)
    c = canvas.Canvas(str(OUT_FILE), pagesize=(page_w, page_h))
    c.setTitle("Cashflow196 Quiz Team Table Tent A4")
    c.setAuthor("Cashflow196")

    c.setFillColor(WHITE)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    margin_x = 29
    panel_w = page_w - margin_x * 2
    panel_h = 233
    bottom_y = 30
    top_y = page_h - bottom_y - panel_h

    draw_panel(c, margin_x, top_y, panel_w, panel_h, rotate=True, seed=20260716)
    draw_fold_line(c, page_w, page_h / 2)
    draw_panel(c, margin_x, bottom_y, panel_w, panel_h, rotate=False, seed=196196)

    c.showPage()
    c.save()


if __name__ == "__main__":
    build()
