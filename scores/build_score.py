#!/usr/bin/env python3
"""Build the Canon in D practice score (MusicXML 4.0) from source/canon.midixml.

The input is a MIDI-XML dump (MusicXML 0.9 MIDI DTD, <MIDIFile>) with
<TicksPerBeat>480</TicksPerBeat>, three tracks and absolute tick positions:
track 0 carries tempo and section markers, track 1 the melody, track 2 the bass.

Pipeline:

  1.  Note-on/off pairs are paired per (track, pitch) into (start, end, midi).
  2.  Measured note lengths are quantised up to the 16th-note grid.  Every key
      is released slightly before the next onset, so each note ends exactly on
      the following onset or bar line -> clean notation, no arbitrary gaps.
  3.  Two staves: track 1 -> treble (right hand), track 2 -> bass (left hand).
      Notes are split at bar lines and tied; rests fill every hole; the leading
      silent bar is dropped.
  4.  Key: the dump says <KeySignature Fifths="0">, but the note content is
      F major (Bb, no B natural, no F#) - the original D major canon moved up a
      minor third (D A B F# G D G A -> F C D A Bb F Bb C).  We write fifths=-1,
      and --transpose -3 gives the same arrangement in D major.

Run:  python build_score.py            # writes canon-practice-f.musicxml + canon-in-d.musicxml
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "source" / "canon.midixml"

DIVISIONS = 480          # ticks per quarter note in the source
GRID = DIVISIONS // 4    # 16th note = 120 ticks
BAR = DIVISIONS * 4      # 4/4

# --------------------------------------------------------------------------
# 1. read the MIDI-XML dump
# --------------------------------------------------------------------------


def load_source(path: Path = SOURCE) -> str:
    """Return the MIDI-XML text (the dump is latin-1, pure ASCII in practice)."""
    return path.read_bytes().decode("iso-8859-1")


# --------------------------------------------------------------------------
# 2. parse MIDI-XML
# --------------------------------------------------------------------------

EVENT_RE = re.compile(r"<Event>([\s\S]*?)</Event>")
ABS_RE = re.compile(r"<Absolute>(\d+)</Absolute>")
NOTE_RE = re.compile(
    r'<Note(On|Off) Channel="(\d+)" Note="(\d+)" Velocity="(\d+)"/>'
)


def parse_midixml(text: str) -> dict:
    ticks_per_beat = int(re.search(r"<TicksPerBeat>(\d+)</TicksPerBeat>", text).group(1))
    tracks: dict[int, dict] = {}
    for m in re.finditer(r'<Track Number="(\d+)">([\s\S]*?)</Track>', text):
        number, body = int(m.group(1)), m.group(2)
        tempos, markers, notes = [], [], []
        pending: dict[int, int] = {}
        for ev in EVENT_RE.finditer(body):
            chunk = ev.group(1)
            a = ABS_RE.search(chunk)
            if not a:
                continue
            tick = int(a.group(1))
            tempo = re.search(r'<SetTempo Value="(\d+)"', chunk)
            if tempo:
                tempos.append((tick, int(tempo.group(1))))
            mark = re.search(r"<Marker>([^<]*)</Marker>", chunk)
            if mark:
                markers.append((tick, mark.group(1).strip()))
            n = NOTE_RE.search(chunk)
            if not n:
                continue
            kind, _chan, pitch, vel = n.group(1), n.group(2), int(n.group(3)), int(n.group(4))
            if kind == "Off" or vel == 0:
                start = pending.pop(pitch, None)
                if start is not None and tick > start:
                    notes.append((start, tick, pitch))
            else:
                pending[pitch] = tick
        notes.sort()
        tracks[number] = {"tempos": tempos, "markers": markers, "notes": notes}
    return {"ticks_per_beat": ticks_per_beat, "tracks": tracks}


# --------------------------------------------------------------------------
# 3. quantise / transpose
# --------------------------------------------------------------------------


def snap_up(t: int) -> int:
    return -(-t // GRID) * GRID


def quantise(notes, transpose: int = 0):
    """Measured lengths -> notated lengths on the 16th grid, capped by the
    next onset of the same line so nothing overlaps."""
    out = []
    for i, (start, end, pitch) in enumerate(notes):
        dur = snap_up(end - start)
        if i + 1 < len(notes):
            dur = min(dur, notes[i + 1][0] - start)
        out.append([start, dur, pitch + transpose])
    return out


# --------------------------------------------------------------------------
# 4. pitch spelling
# --------------------------------------------------------------------------

FLAT_SPELL = {1: ("D", -1), 3: ("E", -1), 6: ("G", -1), 8: ("A", -1), 10: ("B", -1)}
SHARP_SPELL = {1: ("C", 1), 3: ("D", 1), 6: ("F", 1), 8: ("G", 1), 10: ("A", 1)}
NATURAL = {0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B"}


def spell(midi: int, fifths: int):
    pc = midi % 12
    octave = midi // 12 - 1
    table = FLAT_SPELL if fifths < 0 else SHARP_SPELL
    if pc in NATURAL:
        return NATURAL[pc], 0, octave
    step, alter = table[pc]
    return step, alter, octave


# --------------------------------------------------------------------------
# 5. timeline -> measures
# --------------------------------------------------------------------------

# duration in ticks -> (type, dots)
VALUES = [
    (1920, "whole", 0),
    (1440, "half", 1),
    (960, "half", 0),
    (720, "quarter", 1),
    (480, "quarter", 0),
    (360, "eighth", 1),
    (240, "eighth", 0),
    (180, "16th", 1),
    (120, "16th", 0),
]
TYPE_OF = {v[0]: (v[1], v[2]) for v in VALUES}


def decompose(pos: int, dur: int):
    """Split a duration into printable note values that respect the metre."""
    pieces = []
    while dur > 0:
        in_bar = pos % BAR
        limit = 1920
        if in_bar % 480:          # off the beat: nothing longer than an eighth
            limit = 240
        elif in_bar % 960:        # on a beat but not on 1 or 3
            limit = 480
        if in_bar + min(limit, dur) > BAR and in_bar:  # never cross the bar line
            limit = min(limit, BAR - in_bar)
        for ticks, _name, _dots in VALUES:
            if ticks <= dur and ticks <= limit:
                pieces.append(ticks)
                pos += ticks
                dur -= ticks
                break
        else:                      # nothing fits (shouldn't happen): force 16th
            pieces.append(120)
            pos += 120
            dur -= 120
    return pieces


def timeline(notes, total_ticks):
    """(start, dur, midi|None, note_id|None) covering [0, total_ticks).

    note_id groups the pieces of one source note so that ties are only drawn
    where a single note was split, never between two repeated pitches.
    """
    segs, cursor = [], 0
    for index, (start, dur, pitch) in enumerate(notes):
        if start > cursor:
            segs.append((cursor, start - cursor, None, None))
        segs.append((start, max(dur, GRID), pitch, index))
        cursor = max(cursor, start + max(dur, GRID))
    if cursor < total_ticks:
        segs.append((cursor, total_ticks - cursor, None, None))
    return segs


def split_at_barlines(segs):
    """Break rests/notes at bar lines (notes get tied) and long rests at mid-bar."""
    out = []
    for start, dur, pitch, note_id in segs:
        pos, left = start, dur
        while left > 0:
            in_bar = pos % BAR
            room = BAR - in_bar
            take = min(left, room)
            if pitch is None and take > room and in_bar:
                take = room
            out.append((pos, take, pitch, note_id))
            pos += take
            left -= take
    # split long rests at the half bar for readability
    refined = []
    for start, dur, pitch, note_id in out:
        if pitch is None and dur > 960 and start % BAR == 0:
            refined.append((start, 960, None, None))
            refined.append((start + 960, dur - 960, None, None))
        else:
            refined.append((start, dur, pitch, note_id))
    return refined


TIE_TYPES = {
    "start": ["start"],
    "stop": ["stop"],
    "continue": ["stop", "start"],  # a note that ends one tie and starts the next
}


def render_note(pos, dur, pitch, voice, staff, fifths, tie, beams=()):
    """One <note> in MusicXML 4.0 element order:

    pitch/rest -> duration -> tie* -> voice -> type -> dot* -> staff -> beam*
    -> notations/tied*
    """
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
    ties = TIE_TYPES.get(tie, []) if pitch is not None else []
    for kind in ties:
        parts.append(f'        <tie type="{kind}"/>')
    parts.append(f"        <voice>{voice}</voice>")
    ntype, dots = TYPE_OF[dur]
    parts.append(f"        <type>{ntype}</type>")
    parts.extend(["        <dot/>"] * dots)
    parts.append(f"        <staff>{staff}</staff>")
    for number, direction in beams:
        parts.append(f'        <beam number="{number}">{direction}</beam>')
    if ties:
        parts.append("        <notations>")
        for kind in ties:
            parts.append(f'          <tied type="{kind}"/>')
        parts.append("        </notations>")
    parts.append("      </note>")
    return "\n".join(parts)


def beam_plan(events):
    """Explicit per-beat beaming.

    events: [(pos, dur, pitch, tie), ...] in time order for one staff/bar.
    Returns a list of [(beam_number, begin|continue|end), ...] per event.
    Eighths and smaller are beamed together when they are contiguous and sit
    inside the same quarter-note beat; 16ths additionally get a second beam.
    """
    plan = [[] for _ in events]

    def small(i):
        dur = events[i][1]
        return events[i][2] is not None and dur in (240, 120)

    i = 0
    n = len(events)
    while i < n:
        if not small(i):
            i += 1
            continue
        beat = events[i][0] // 480
        j = i
        while (
            j + 1 < n
            and small(j + 1)
            and events[j + 1][1] == events[i][1]      # same note value only
            and events[j + 1][0] // 480 == beat
            and events[j][0] + events[j][1] == events[j + 1][0]
            and events[j + 1][3] in (None, "stop", "continue")
        ):
            j += 1
        group = list(range(i, j + 1))
        if len(group) >= 2:
            for k, idx in enumerate(group):
                if k == 0:
                    plan[idx].append((1, "begin"))
                elif k == len(group) - 1:
                    plan[idx].append((1, "end"))
                else:
                    plan[idx].append((1, "continue"))
            # second beam for runs of 16ths inside the group
            run = []
            for idx in group + [None]:
                if idx is not None and events[idx][1] == 120:
                    run.append(idx)
                    continue
                if len(run) >= 2:
                    for k, r in enumerate(run):
                        plan[r].append((2, "begin" if k == 0 else "end" if k == len(run) - 1 else "continue"))
                run = []
        i = j + 1
    return plan


def render_measure(number, segs_by_staff, fifths, rehearsal=None, first=False, prefix=""):
    out = [f'    <measure number="{number}">']
    if prefix:
        out.append(prefix.rstrip("\n"))
    if first:
        out.append(
            "      <attributes>\n"
            f"        <divisions>{DIVISIONS}</divisions>\n"
            "        <key>\n"
            f"          <fifths>{fifths}</fifths>\n"
            "          <mode>major</mode>\n"
            "        </key>\n"
            "        <time>\n"
            "          <beats>4</beats>\n"
            "          <beat-type>4</beat-type>\n"
            "        </time>\n"
            "        <staves>2</staves>\n"
            '        <clef number="1">\n'
            "          <sign>G</sign>\n"
            "          <line>2</line>\n"
            "        </clef>\n"
            '        <clef number="2">\n'
            "          <sign>F</sign>\n"
            "          <line>4</line>\n"
            "        </clef>\n"
            "      </attributes>"
        )
        out.append(
            '      <direction placement="above">\n'
            "        <direction-type>\n"
            "          <metronome>\n"
            "            <beat-unit>quarter</beat-unit>\n"
            "            <per-minute>50</per-minute>\n"
            "          </metronome>\n"
            "        </direction-type>\n"
            '        <sound tempo="50"/>\n'
            "      </direction>"
        )
    if rehearsal:
        out.append(
            '      <direction placement="above">\n'
            "        <direction-type>\n"
            f"          <rehearsal>{escape(rehearsal)}</rehearsal>\n"
            "        </direction-type>\n"
            "      </direction>"
        )
    for staff, voice, segs in segs_by_staff:
        if not segs:
            segs = [(0, BAR, None, None)]
        if (
            len(segs) == 1
            and segs[0][2] is None
            and segs[0][1] == BAR
            and segs[0][0] % BAR == 0
        ):
            out.append(
                "      <note>\n"
                '        <rest measure="yes"/>\n'
                f"        <duration>{BAR}</duration>\n"
                f"        <voice>{voice}</voice>\n"
                f"        <staff>{staff}</staff>\n"
                "      </note>"
            )
            continue
        # one printable value per piece; ties follow the source note id so that
        # two repeated pitches stay separate notes
        expanded = []
        for pos, dur, pitch, note_id in segs:
            for piece in decompose(pos, dur):
                expanded.append((pos, piece, pitch, note_id))
                pos += piece
        events = []
        for i, (pos, dur, pitch, note_id) in enumerate(expanded):
            tie = None
            if pitch is not None and note_id is not None:
                prev_same = (
                    i > 0
                    and expanded[i - 1][3] == note_id
                    and expanded[i - 1][0] + expanded[i - 1][1] == pos
                )
                next_same = (
                    i + 1 < len(expanded)
                    and expanded[i + 1][3] == note_id
                    and pos + dur == expanded[i + 1][0]
                )
                if prev_same and next_same:
                    tie = "continue"
                elif prev_same:
                    tie = "stop"
                elif next_same:
                    tie = "start"
            events.append((pos, dur, pitch, tie))
        beams = beam_plan(events)
        for (pos, dur, pitch, tie), plan in zip(events, beams):
            out.append(render_note(pos, dur, pitch, voice, staff, fifths, tie, plan))
    out.append("    </measure>")
    return "\n".join(out)


def build(midi: int, transpose: int, fifths: int, title: str, subtitle: str, out: Path):
    text = load_source(SOURCE)
    data = parse_midixml(text)
    tracks = data["tracks"]
    melody = quantise(tracks[1]["notes"], transpose)
    bass = quantise(tracks[2]["notes"], transpose)

    # drop the player's silent lead-in bar: shift everything so the first
    # sounding beat is bar 1 beat 1
    first = min(n[0] for n in melody + bass)
    offset = first - (first % BAR)
    melody = [[s - offset, d, p] for s, d, p in melody]
    bass = [[s - offset, d, p] for s, d, p in bass]

    last = max(s + d for s, d, _ in melody + bass)
    total = -(-last // BAR) * BAR
    bars = total // BAR

    rehearsal = {}
    for tick, label in tracks[0]["markers"]:
        if tick < offset:
            continue
        bar = (tick - offset) // BAR + 1
        if 1 < bar <= bars:
            rehearsal[bar] = label

    mel_segs = split_at_barlines(timeline(melody, total))
    bass_segs = split_at_barlines(timeline(bass, total))

    def per_bar(segs):
        out = [[] for _ in range(bars)]
        for seg in segs:
            out[seg[0] // BAR].append(seg)
        return out

    mel_bars, bass_bars = per_bar(mel_segs), per_bar(bass_segs)

    # encoded layout: 3 bars per system, page break after bar 18
    per_system = 3
    page_break_bar = 19

    body = []
    for i in range(bars):
        marker = ""
        if i == page_break_bar - 1:
            marker = '      <print new-page="yes"/>\n'
        elif i and i % per_system == 0:
            marker = '      <print new-system="yes"/>\n'
        body.append(
            render_measure(
                i + 1,
                [(1, 1, mel_bars[i]), (2, 2, bass_bars[i])],
                fifths,
                rehearsal=rehearsal.get(i + 1),
                first=(i == 0),
                prefix=marker,
            )
        )

    header = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>{escape(title)}</work-title>
  </work>
  <movement-title>{escape(subtitle)}</movement-title>
  <identification>
    <creator type="composer">Johann Pachelbel (1653-1706)</creator>
    <creator type="arranger">Practice arrangement as played on OnlinePianist Virtual Piano</creator>
    <creator type="transcriber">Nocturne build_score.py</creator>
    <rights>Composition public domain. Practice arrangement and audio by OnlinePianist; this MusicXML is an independent engraving by Nocturne for personal study.</rights>
    <encoding>
      <software>Nocturne build_score.py</software>
      <encoding-date>2026-11-22</encoding-date>
    </encoding>
    <source>https://www.onlinepianist.com/virtual-piano</source>
  </identification>
  <defaults>
    <scaling>
      <millimeters>7.0</millimeters>
      <tenths>40</tenths>
    </scaling>
    <appearance>
      <line-width type="staff">0.7</line-width>
      <line-width type="stem">0.8</line-width>
      <line-width type="beam">3.5</line-width>
    </appearance>
    <music-font font-family="Leland" font-weight="normal"/>
    <word-font font-family="Times New Roman" font-size="10"/>
  </defaults>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <part-abbreviation>Pno.</part-abbreviation>
      <score-instrument id="P1-I1">
        <instrument-name>Piano</instrument-name>
      </score-instrument>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>1</midi-program>
        <volume>80</volume>
        <pan>0</pan>
      </midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">"""

    xml = header + "\n" + "\n".join(body) + "\n  </part>\n</score-partwise>\n"
    out.write_text(xml, encoding="utf-8")

    notes = len(melody) + len(bass)
    secs = total / DIVISIONS * 60 / 50
    print(
        f"{out.name}: {bars} bars, {notes} notes "
        f"(melody {len(melody)}, bass {len(bass)}), fifths={fifths}, "
        f"transpose={transpose:+d}, {secs:.1f}s @ 50 BPM, "
        f"rehearsal marks at bars {sorted(rehearsal)}"
    )
    return {"bars": bars, "notes": notes, "seconds": secs}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.parse_args()
    build(
        0,
        0,
        -1,
        "Pachelbel's Canon (Canon in D)",
        "Practice arrangement - as played on OnlinePianist Virtual Piano (F major)",
        HERE / "canon-practice-f.musicxml",
    )
    build(
        0,
        -3,
        2,
        "Pachelbel's Canon (Canon in D)",
        "Practice arrangement, transposed to the original key of D major",
        HERE / "canon-in-d.musicxml",
    )
