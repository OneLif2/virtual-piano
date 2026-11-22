#!/usr/bin/env python3
"""Find a song in the virtual piano catalogue and save its practice pack.

    python fetch_song.py --search canon            # just list matches
    python fetch_song.py --id 7961 --out songs     # save the pack + audio

Writes  songs/<id>_full.song   (the data the player loads)
        songs/<id>_full.m4a    (the audio the player streams)
and prints size + SHA-256 for both.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

SITE = "https://www.onlinepianist.com"
ASSETS = f"{SITE}/static_assets"
CATALOG = f"{ASSETS}/vp/catalog.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Referer": f"{SITE}/virtual-piano",
}


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def catalogue() -> dict:
    return json.loads(get(CATALOG))


def search(term: str) -> list[dict]:
    data = catalogue()
    needle = term.casefold()
    hits = [
        song
        for song in data["songs"]
        if needle in song["title"].casefold() or needle in (song.get("composer") or "").casefold()
    ]
    return hits


def save(url: str, path: Path) -> None:
    blob = get(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    digest = hashlib.sha256(blob).hexdigest()
    print(f"  {path}  {len(blob):,} bytes  sha256 {digest}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--search", help="filter the catalogue by title or composer")
    ap.add_argument("--id", type=int, help="song id to download")
    ap.add_argument("--out", type=Path, default=Path("songs"))
    args = ap.parse_args()

    if args.search:
        hits = search(args.search)
        print(f"{len(hits)} match(es) for {args.search!r}:")
        for song in hits:
            print(f'  {song["id"]:>5}  {song["title"]} — {song.get("composer") or "?"}')
        if not args.id:
            raise SystemExit(0 if hits else 1)

    if not args.id:
        raise SystemExit("give --search and/or --id")

    song = next((s for s in catalogue()["songs"] if s["id"] == args.id), None)
    if song is None:
        raise SystemExit(f"id {args.id} is not in the catalogue")
    print(f'{song["id"]}  {song["title"]} — {song.get("composer") or "?"}')

    base = f"{ASSETS}/data/pivot/{args.id}/{args.id}_full"
    save(f"{base}.song", args.out / f"{args.id}_full.song")
    save(f"{base}.m4a", args.out / f"{args.id}_full.m4a")
