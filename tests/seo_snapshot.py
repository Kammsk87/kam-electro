#!/usr/bin/env python3
"""Capture SEO-relevant facts for every public site HTML page."""

import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    "fit-coach-mvp",
    "quiz-game",
    "share",
    "node_modules",
    ".git",
    "tests",
}
SKIP_FILES = {"yandex_58997e3dcee658b5.html"}


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts = []
        self.buf = []
        self.blocks = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "head"}:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "head"} and self.skip:
            self.skip -= 1
        if tag in {
            "p", "li", "h1", "h2", "h3", "h4", "tr", "figcaption", "summary",
            "a", "button", "dt", "dd", "td", "th", "label", "option",
        }:
            self.flush()

    def handle_data(self, data):
        if self.skip:
            return
        text = " ".join(data.split())
        if text:
            self.parts.append(text)
            self.buf.append(text)

    def flush(self):
        chunk = " ".join(self.buf).strip()
        self.buf = []
        if chunk:
            self.blocks.append(chunk)

    def close(self):
        super().close()
        self.flush()


def site_html_files():
    files = []
    for path in ROOT.rglob("*.html"):
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        files.append(path)
    return sorted(files, key=lambda p: str(p.relative_to(ROOT)))


def attr(tag, name):
    match = re.search(rf'{name}="([^"]*)"', tag)
    return match.group(1) if match else ""


def extract(path: Path):
    html = path.read_text(encoding="utf-8")
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    description = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
    if not description:
        description = re.search(r'<meta\s+content="([^"]*)"\s+name="description"', html)
    canonical = re.search(r'<link\s+rel="canonical"\s+href="([^"]*)"', html)
    robots = re.search(r'<meta\s+name="robots"\s+content="([^"]*)"', html)
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    h1s = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h)).strip() for h in h1s]
    json_ld = re.findall(
        r'<script type="application/ld\+json">\s*(.*?)\s*</script>', html, re.S
    )
    json_ld_norm = []
    for block in json_ld:
        json_ld_norm.append(json.loads(block))
    parser = TextExtractor()
    parser.feed(html)
    parser.close()
    text = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()
    hrefs = re.findall(r'href="([^"]*)"', html)
    goals = re.findall(r'data-goal="([^"]*)"', html)
    return {
        "title": re.sub(r"\s+", " ", title.group(1)).strip() if title else "",
        "description": description.group(1) if description else "",
        "canonical": canonical.group(1) if canonical else "",
        "robots": robots.group(1) if robots else "",
        "h1": h1s,
        "json_ld": json_ld_norm,
        "text": text,
        "chunks": parser.blocks,
        "hrefs": hrefs,
        "goals": goals,
        "metrika": html.count("109302641"),
    }


def infra():
    out = {}
    for name in ("robots.txt", "sitemap.xml", "CNAME", "yandex_58997e3dcee658b5.html"):
        data = (ROOT / name).read_bytes()
        out[name] = {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
    return out


def snapshot():
    pages = {}
    for path in site_html_files():
        pages[str(path.relative_to(ROOT))] = extract(path)
    return {"pages": pages, "infra": infra()}


def main():
    data = snapshot()
    if len(sys.argv) > 1:
        dest = Path(sys.argv[1])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {dest} pages={len(data['pages'])}")
    else:
        json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
