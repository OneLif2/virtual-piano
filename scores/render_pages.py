#!/usr/bin/env python3
"""Engrave the generated MusicXML with Verovio into standalone SVG pages.

No CDN, no browser at runtime: the SVGs are self-contained and are what the
published page shows.  Both scores share one page geometry so the two versions
line up measure for measure.
"""
from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import verovio

HERE = Path(__file__).resolve().parent

OPTIONS = {
    "pageWidth": 2100,
    "pageHeight": 2970,
    "svgViewBox": True,
    "scale": 42,
    "header": "none",
    "footer": "none",
    "pageMarginTop": 40,
    "pageMarginBottom": 40,
    "pageMarginLeft": 45,
    "pageMarginRight": 45,
    "spacingStaff": 10,
    "spacingSystem": 8,
    "breaks": "encoded",
    "condense": "none",
    "justifyVertically": False,
    "adjustPageHeight": True,
}


def render(xml: Path, prefix: str) -> list[dict]:
    toolkit = verovio.toolkit()
    toolkit.setOptions(OPTIONS)
    if not toolkit.loadFile(str(xml)):
        raise SystemExit(f"verovio could not load {xml}")
    pages = toolkit.getPageCount()
    out = []
    for i in range(1, pages + 1):
        svg = toolkit.renderToSVG(i)
        path = HERE / f"{prefix}-{i:02d}.svg"
        path.write_text(svg, encoding="utf-8")
        tree = ET.fromstring(svg)
        measures = sum(
            1 for el in tree.iter() if "measure" in el.get("class", "").split()
        )
        out.append({"page": i, "file": path.name, "measures": measures})
        print(f"  {path.name}: {measures} measures, {len(svg)//1024} KB")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["f", "d"])
    args = ap.parse_args()
    jobs = [("canon-practice-f.musicxml", "practice-f"), ("canon-in-d.musicxml", "canon-d")]
    for name, prefix in jobs:
        if args.only and args.only not in prefix:
            continue
        print(name)
        pages = render(HERE / name, prefix)
        print(f"  total {len(pages)} pages")
