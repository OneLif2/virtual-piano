#!/usr/bin/env python3
"""Demo: decoded virtual-piano song text (MIDI-XML) -> MusicXML 4.0.

This is the short, readable version of the pipeline (no beaming, no layout
tricks) meant to be read alongside README.md. The production engraving that
produced ../scores/*.musicxml lives there and adds beaming, ties, rehearsal
marks and page layout.

    python to_musicxml.py sample-7961.midixml --out demo-7961.musicxml
"""
from __future__ import annotations

import argparse
import re
from collections import Counter
from pathlib import Path

DIV = 480                 # ticks per quarter note in these files
BAR = DIV * 4             # 4/4
GRID = DIV // 4           # quantise everything to 16th notes

MAJOR_STEPS = (0, 2, 4, 5, 7, 9, 11)
NATURAL = {0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B"}
FLAT = {1: ("D", -1), 3: ("E", -1), 6: ("G", -1), 8: ("A", -1), 10: ("B", -1)}
SHARP = {1: ("C", 1), 3: ("D", 1), 6: ("F", 1), 8: ("G", 1), 10: ("A", 1)}

VALUES = [
    (1920, "whole", 0), (1440, "half", 1), (960, "half", 0),
    (720, "quarter", 1), (480, "quarter", 0), (360, "eighth", 1),
    (240, "eighth", 0), (180, "16th", 1), (120, "16th", 0),
]
TYPE_OF = {d: (name, dots) for d, name, dots in VALUES}


# ---------------------------------------------------------------- parse ----
def parse_midixml(text: str):
    """Return (ticks_per_beat, {track_no: {'notes': [...], ...}})."""
    ticks = int(re.search(r"<TicksPerBeat>(\d+)</TicksPerBeat>", text).group(1))
    tracks: dict[int, dict] = {}
    for tm in re.finditer(r'<Track Number="(\d+)">([\s\S]*?)</Track>', text):
        number, body = int(tm.group(1)), tm.group(2)
        notes, held, tempos, markers = [], {}, [], []
        for ev in re.finditer(r"<Event>([\s\S]*?)</Event>", body):
            chunk = ev.group(1)
            a = re.search(r"<Absolute>(\d+)</Absolute>", chunk)
            if not a:
                continue
            tick = int(a.group(1))
            tempo = re.search(r'<SetTempo Value="(\d+)"', chunk)
            if tempo:
                tempos.append((tick, int(tempo.group(1))))
            marker = re.search(r"<Marker>([^<]*)</Marker>", chunk)
            if marker:
                markers.append((tick, marker.group(1).strip()))
            note = re.search(
                r'<Note(On|Off) Channel="\d+" Note="(\d+)" Velocity="(\d+)"/>', chunk
            )
            if not note:
                continue
            kind, pitch, velocity = note.group(1), int(note.group(2)), int(note.group(3))
            if kind == "Off" or velocity == 0:
                start = held.pop(pitch, None)
                if start is not None and tick > start:
                    notes.append((start, tick, pitch))
            else:
                held[pitch] = tick
        notes.sort()
        tracks[number] = {"notes": notes, "tempos": tempos, "markers": markers}
    return ticks, tracks


# ------------------------------------------------------------------ key ----
def guess_key(notes, allowed=(-7, 7)):
    """Pick the major key that leaves the fewest notes outside the scale.

    The song files carry a <KeySignature Fifths=".."> event, but it is not
    always right; deriving the key from the pitches is more reliable.
    """
    counts = Counter(pitch % 12 for _, _, pitch in notes)
    best = None
    for fifths in range(allowed[0], allowed[1] + 1):
        tonic = (7 * fifths) % 12
        scale = {(tonic + step) % 12 for step in MAJOR_STEPS}
        outside = sum(n for pc, n in counts.items() if pc not in scale)
        candidate = (outside, abs(fifths), fifths)
        if best is None or candidate < best:
            best = candidate
    return best[2]


def spell(midi: int, fifths: int):
    pc, octave = midi % 12, midi // 12 - 1
    if pc in NATURAL:
        return NATURAL[pc], 0, octave
    step, alter = (FLAT if fifths < 0 else SHARP)[pc]
    return step, alter, octave


# ------------------------------------------------------------- timeline ----
def quantise(notes):
    """Measured length -> 16th grid, never past the next onset."""
    out = []
    for i, (start, end, pitch) in enumerate(notes):
        dur = -(-(end - start) // GRID) * GRID
        if i + 1 < len(notes):
            dur = min(dur, notes[i + 1][0] - start)
        out.append([start, dur, pitch])
    return out


def decompose(pos: int, dur: int):
    """Split a duration into printable values without crossing beat 1/3/bar."""
    pieces = []
    while dur > 0:
        in_bar = pos % BAR
        limit = 1920
        if in_bar % 480:
            limit = 240
        elif in_bar % 960:
            limit = 480
        if in_bar:
            limit = min(limit, BAR - in_bar)
        for ticks, _name, _dots in VALUES:
            if ticks <= dur and ticks <= limit:
                pieces.append(ticks)
                pos += ticks
                dur -= ticks
                break
        else:
            pieces.append(GRID)
            pos += GRID
            dur -= GRID
    return pieces


def segments(notes, total):
    """(start, dur, pitch|None, note_id) from 0 to total, rests filled in."""
    out, cursor = [], 0
    for index, (start, dur, pitch) in enumerate(notes):
        if start > cursor:
            out.append((cursor, start - cursor, None, None))
        out.append((start, max(dur, GRID), pitch, index))
        cursor = max(cursor, start + max(dur, GRID))
    if cursor < total:
        out.append((cursor, total - cursor, None, None))
    return out


def split_at_bars(segs):
    out = []
    for start, dur, pitch, nid in segs:
        pos, left = start, dur
        while left > 0:
            room = BAR - pos % BAR
            take = min(left, room)
            out.append((pos, take, pitch, nid))
            pos += take
            left -= take
    return out


# ------------------------------------------------------------------ xml ----
def note_xml(pos, dur, pitch, staff, voice, fifths, tie):
    parts = ["      <note>"]
    if pitch is None:
        parts.append("        <rest/>")
    else:
        step, alter, octave = spell(pitch, fifths)
        parts.append("        <pitch>")
        parts.append(f"          <step>{step}</step>")
        if alter:
            parts.append(f"          <alter>{alter}</alter>")
        parts.append(f"          <octave>{octave}</octave>")
        parts.append("        </pitch>")
    parts.append(f"        <duration>{dur}</duration>")
    kinds = ("stop", "start") if tie == "continue" else ((tie,) if tie else ())
    for kind in kinds:
        parts.append(f'        <tie type="{kind}"/>')
    parts.append(f"        <voice>{voice}</voice>")
    name, dots = TYPE_OF[dur]
    parts.append(f"        <type>{name}</type>")
    parts.extend(["        <dot/>"] * dots)
    parts.append(f"        <staff>{staff}</staff>")
    if kinds:
        parts.append("        <notations>")
        for kind in kinds:
            parts.append(f'          <tied type="{kind}"/>')
        parts.append("        </notations>")
    parts.append("      </note>")
    return "\n".join(parts)


def build(text: str, title: str, drop_lead_in: bool = True) -> tuple[str, dict]:
    ticks, tracks = parse_midixml(text)
    pitched_tracks = [n for n, t in sorted(tracks.items()) if t["notes"]]
    lines = [(number, quantise(tracks[number]["notes"])) for number in pitched_tracks]

    first = min(note[0] for _, notes in lines for note in notes)
    offset = first - (first % BAR) if drop_lead_in else 0
    lines = [(number, [[s - offset, d, p] for s, d, p in notes]) for number, notes in lines]
    last = max(s + d for _, notes in lines for s, d, _ in notes)
    bars = -(-last // BAR)

    all_notes = [n for _, notes in lines for n in notes]
    fifths = guess_key(all_notes)
    tempo = 120
    if tracks[0]["tempos"]:
        tempo = round(60_000_000 / tracks[0]["tempos"][0][1])
    markers = {tick - offset: label for tick, label in tracks[0]["markers"] if tick >= offset}

    # one staff per track: melody on top, bass below
    staff_of = {number: index + 1 for index, (number, _) in enumerate(lines)}
    per_bar = {}
    for number, notes in lines:
        staff = staff_of[number]
        segs = split_at_bars(segments(notes, bars * BAR))
        for start, dur, pitch, nid in segs:
            per_bar.setdefault((start // BAR, staff), []).append((start, dur, pitch, nid))

    body = []
    for bar in range(bars):
        out = [f'    <measure number="{bar + 1}">']
        if bar == 0:
            clefs = "".join(
                f'        <clef number="{staff}"><sign>{"G" if staff == 1 else "F"}</sign>'
                f'<line>{2 if staff == 1 else 4}</line></clef>\n'
                for staff in range(1, len(lines) + 1)
            )
            out.append(
                "      <attributes>\n"
                f"        <divisions>{DIV}</divisions>\n"
                f"        <key><fifths>{fifths}</fifths><mode>major</mode></key>\n"
                "        <time><beats>4</beats><beat-type>4</beat-type></time>\n"
                f"        <staves>{len(lines)}</staves>\n"
                f"{clefs}"
                "      </attributes>"
            )
            out.append(
                '      <direction placement="above"><direction-type><metronome>'
                f"<beat-unit>quarter</beat-unit><per-minute>{tempo}</per-minute>"
                f'</metronome></direction-type><sound tempo="{tempo}"/></direction>'
            )
        for tick, label in markers.items():
            if tick // BAR == bar:
                out.append(
                    '      <direction placement="above"><direction-type>'
                    f"<rehearsal>{label}</rehearsal></direction-type></direction>"
                )
        for staff in range(1, len(lines) + 1):
            segs = per_bar.get((bar, staff), [(bar * BAR, BAR, None, None)])
            events = []
            for pos, dur, pitch, nid in segs:
                for piece in decompose(pos, dur):
                    events.append((pos, piece, pitch, nid))
                    pos += piece
            for i, (pos, dur, pitch, nid) in enumerate(events):
                tie = None
                if pitch is not None and nid is not None:
                    prev = i > 0 and events[i - 1][3] == nid and events[i - 1][0] + events[i - 1][1] == pos
                    nxt = i + 1 < len(events) and events[i + 1][3] == nid and pos + dur == events[i + 1][0]
                    tie = "continue" if prev and nxt else "stop" if prev else "start" if nxt else None
                out.append(note_xml(pos, dur, pitch, staff, staff, fifths, tie))
        out.append("    </measure>")
        body.append("\n".join(out))

    header = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>{title}</work-title></work>
  <identification>
    <encoding><software>to_musicxml.py</software></encoding>
  </identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">"""
    stats = {
        "bars": bars,
        "notes": len(all_notes),
        "tracks": len(lines),
        "fifths": fifths,
        "tempo": tempo,
        "ticks_per_beat": ticks,
    }
    return header + "\n" + "\n".join(body) + "\n  </part>\n</score-partwise>\n", stats


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("midixml", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--title", default="Virtual piano practice song")
    args = ap.parse_args()
    xml, stats = build(args.midixml.read_text("latin-1"), args.title)
    args.out.write_text(xml, encoding="utf-8")
    print(
        f"{args.out.name}: {stats['bars']} bars, {stats['notes']} notes, "
        f"{stats['tracks']} staff, fifths={stats['fifths']}, "
        f"quarter={stats['tempo']}, {stats['ticks_per_beat']} ticks/beat"
    )
