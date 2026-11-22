#!/usr/bin/env python3
"""Unwrap a virtual-piano .song pack into its MIDI-XML text.

The player treats the file as a ZIP with one member, inflates it, then XORs
the result with a fixed 32-byte key. What comes out is a <MIDIFile> document
(MusicXML 0.9 MIDI DTD) with absolute tick positions.

    python decode_song.py sample-7961.song
    python decode_song.py songs/7961_full.song --out canon.midixml --summary
"""
from __future__ import annotations

import argparse
import re
import zipfile
from pathlib import Path

KEY = b"1mN1Iri8116261127824664135251"  # keystream used by the web player


def decode(path: Path) -> bytes:
    """Inflate the ZIP member and undo the XOR."""
    with zipfile.ZipFile(path) as archive:
        raw = archive.read(archive.namelist()[0])
    data = bytearray(raw)
    size = len(KEY)
    for index in range(len(data)):
        data[index] ^= KEY[index % size]
    return bytes(data)


def summarise(text: str) -> None:
    ticks = re.search(r"<TicksPerBeat>(\d+)</TicksPerBeat>", text)
    fmt = re.search(r"<Format>(\d+)</Format>", text)
    print(f"  ticks per beat : {ticks.group(1) if ticks else '?'}")
    print(f"  format         : {fmt.group(1) if fmt else '?'}")

    for block in re.finditer(r'<Track Number="(\d+)">([\s\S]*?)</Track>', text):
        number, body = int(block.group(1)), block.group(2)
        notes, held = [], {}
        for event in re.finditer(r"<Event>([\s\S]*?)</Event>", body):
            chunk = event.group(1)
            absolute = re.search(r"<Absolute>(\d+)</Absolute>", chunk)
            note = re.search(
                r'<Note(On|Off) Channel="\d+" Note="(\d+)" Velocity="(\d+)"/>', chunk
            )
            if not (absolute and note):
                continue
            tick = int(absolute.group(1))
            kind, pitch, velocity = note.group(1), int(note.group(2)), int(note.group(3))
            if kind == "Off" or velocity == 0:
                start = held.pop(pitch, None)
                if start is not None and tick > start:
                    notes.append((start, tick, pitch))
            else:
                held[pitch] = tick
        tempos = [int(t) for t in re.findall(r'<SetTempo Value="(\d+)"', body)]
        markers = re.findall(r"<Marker>([^<]*)</Marker>", body)
        bits = []
        if tempos:
            bits.append("tempo " + ", ".join(f"{round(60_000_000 / t)} bpm" for t in tempos))
        if markers:
            bits.append("markers " + ", ".join(markers))
        if notes:
            span = f"pitch {min(n[2] for n in notes)}..{max(n[2] for n in notes)}"
        else:
            span = "no notes"
        count = f"{len(notes)} notes" if notes else "no notes"
        print(f"  track {number}: {count}, {span}" if notes else f"  track {number}: {count}"
              + (f"; {'; '.join(bits)}" if bits else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("song", type=Path)
    ap.add_argument("--out", type=Path, help="where to write the .midixml text")
    ap.add_argument("--summary", action="store_true", help="print what is inside")
    args = ap.parse_args()

    text = decode(args.song).decode("iso-8859-1")
    target = args.out or args.song.with_suffix(".midixml")
    target.write_text(text, encoding="utf-8", newline="\n")
    print(f"{args.song.name} -> {target}  ({len(text):,} chars)")
    if args.summary:
        summarise(text)
