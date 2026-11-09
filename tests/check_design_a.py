#!/usr/bin/env python3
"""Compare the working tree with the pre-design SEO snapshot."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))
from seo_snapshot import infra, snapshot  # noqa: E402

BEFORE = json.loads((ROOT / "tests/fixtures/seo-before.json").read_text(encoding="utf-8"))
ALLOWED_REMOVED = [
    "После отправки мы увидим заявку и свяжемся с вами в ближайшее время.",
    # Approved visible H2 replacements on the homepage. Not used in title,
    # description, canonical or JSON-LD.
    "Сайт должен сразу отсекать мелкие заявки и приводить подходящие объекты",
    "Разбираем электромонтаж через вопросы, которые ведут к заявке",
]
ASSET_SUFFIXES = ("styles.css", "script.js", "favicon.svg")


def norm_href(href):
    base = href.split("?", 1)[0]
    if base.endswith(ASSET_SUFFIXES):
        return None
    return href


ALLOWED_SITEMAP_ADDITIONS = {"https://kamtok.ru/kalkulyator-kabelya/"}


def sitemap_locs(text):
    return re.findall(r"<loc>(.*?)</loc>", text)


def check_infra(after_infra):
    problems = []
    before = before_infra()
    for name in ("robots.txt", "CNAME", "yandex_58997e3dcee658b5.html"):
        if before[name] != after_infra[name]:
            problems.append(f"{name} changed")
    if before["sitemap.xml"] == after_infra["sitemap.xml"]:
        return problems
    old_text = (ROOT / "tests/fixtures/sitemap-main.xml").read_text(encoding="utf-8")
    new_text = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    old_locs = sitemap_locs(old_text)
    new_locs = sitemap_locs(new_text)
    missing = [loc for loc in old_locs if loc not in new_locs]
    added = [loc for loc in new_locs if loc not in old_locs]
    if missing or set(added) - ALLOWED_SITEMAP_ADDITIONS:
        problems.append(f"sitemap.xml changed beyond the calculator URL: missing={missing} added={added}")
    return problems


def main():
    after = snapshot()
    problems = []
    problems.extend(check_infra(after["infra"]))

    for page, old in BEFORE["pages"].items():
        new = after["pages"].get(page)
        if new is None:
            problems.append(f"missing page {page}")
            continue
        for key in ("title", "description", "canonical", "robots"):
            if old[key] != new[key]:
                problems.append(f"{page} {key} changed")
        if old["h1"] != new["h1"]:
            problems.append(f"{page} h1 changed: {old['h1']!r} -> {new['h1']!r}")
        if old["json_ld"] != new["json_ld"]:
            problems.append(f"{page} JSON-LD changed")
        if old["metrika"] != new["metrika"] or new["metrika"] < 1:
            problems.append(f"{page} Metrika 109302641 count changed")
        missing = []
        for chunk in old["chunks"]:
            if chunk in new["text"]:
                continue
            reduced = chunk
            for sentence in ALLOWED_REMOVED:
                reduced = " ".join(reduced.replace(sentence, " ").split())
            if chunk in ALLOWED_REMOVED or (reduced and reduced in new["text"]):
                continue
            missing.append(chunk)
        if missing:
            problems.append(f"{page} lost text: {missing[:6]}")
        lost_hrefs = sorted(
            set(filter(None, map(norm_href, old["hrefs"])))
            - set(filter(None, map(norm_href, new["hrefs"])))
        )
        if lost_hrefs:
            problems.append(f"{page} lost links: {lost_hrefs}")
        lost_goals = sorted(set(old["goals"]) - set(new["goals"]))
        if lost_goals:
            problems.append(f"{page} lost goals: {lost_goals}")
        if "ЕКБ" in new["text"]:
            problems.append(f"{page} contains ЕКБ")

    script = (ROOT / "script.js").read_text(encoding="utf-8")
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    if 'createElement("iframe")' in script or "showSubmissionSuccess" in script:
        problems.append("false form success path is still in script.js")
    if "lead_form_submit" not in script or "lead_form_submit" not in index:
        problems.append("goal name lead_form_submit was removed")
    if 'reachGoal("lead_form_submit")' in script or "reachGoal(LEAD_FORM_SUBMIT_GOAL)" in script:
        problems.append("lead_form_submit is still sent")
    if "mobile-lead-bar" in script or "mobile-lead-bar" in index:
        problems.append("covering mobile lead bar is still present")
    if "data-netlify" in index:
        problems.append("Netlify form attribute is still present")
    if 'onsubmit="return false"' not in index or 'type="submit" disabled' not in index:
        problems.append("lead form is not disabled")
    if "https://t.me/kam_ekb?" in index or "https://t.me/kam_ekb?text=" in index:
        problems.append("Telegram link claims a prefilled message")
    if not (ROOT / "robots.txt").read_text(encoding="utf-8").startswith("User-agent:"):
        problems.append("robots.txt unexpected")

    if problems:
        print("\n".join(problems))
        return 1
    print(f"ok pages={len(after['pages'])} infra={after['infra']}")
    return 0


def before_infra():
    return BEFORE["infra"]


if __name__ == "__main__":
    sys.exit(main())
