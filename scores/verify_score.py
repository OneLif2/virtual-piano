#!/usr/bin/env python3
"""Independent check of the generated MusicXML.

Re-reads the XML, rebuilds every sounding note (merging tied chains), sums the
measure durations and compares everything against the source .song data.
"""
from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import build_score as B

HERE = Path(__file__).resolve().parent
STEP_SEMI = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi_of(note) -> int | None:
    p = note.find("pitch")
    if p is None:
        return None
    step = p.findtext("step")
    alter = int(p.findtext("alter") or 0)
    octave = int(p.findtext("octave"))
    return (octave + 1) * 12 + STEP_SEMI[step] + alter


def read_xml(path: Path):
    root = ET.parse(path).getroot()
    assert root.tag == "score-partwise", root.tag
    assert root.get("version") == "4.0"
    parts = root.findall("part")
    assert len(parts) == 1, "expected a single piano part"
    part = parts[0]
    measures = part.findall("measure")
    staff_notes = {1: [], 2: []}
    bar_durations = Counter()
    open_tie = {}
    for index, measure in enumerate(measures):
        assert measure.get("number") == str(index + 1)
        cursor = {1: index * B.BAR, 2: index * B.BAR}
        for note in measure.findall("note"):
            dur = int(note.findtext("duration"))
            staff = int(note.findtext("staff"))
            voice = note.findtext("voice")
            bar_pos = cursor[staff]
            pitches = note.findall("pitch")
            assert len(pitches) <= 1
            bar_durations[staff] += dur
            tie_stop = note.find("tie[@type='stop']") is not None
            tie_start = note.find("tie[@type='start']") is not None
            midi = midi_of(note)
            if midi is None:
                assert not tie_start and not tie_stop
                cursor[staff] += dur
                continue
            key = (staff, voice, midi)
            if tie_stop:
                open_tie.pop(key)
                staff_notes[staff][-1][1] += dur
                if tie_start:
                    open_tie[key] = True
                cursor[staff] += dur
                continue
            staff_notes[staff].append([bar_pos, dur, midi])
            if tie_start:
                open_tie[key] = True
            cursor[staff] += dur
        # rests do not advance bar_pos for notes; verify bar length below
    assert not open_tie, open_tie
    for staff, total in bar_durations.items():
        assert total == B.BAR * len(measures), (staff, total)
    return measures, staff_notes


def source_expectation(transpose: int, bars: int):
    data = B.parse_midixml(B.load_source())
    mel = B.quantise(data["tracks"][1]["notes"], transpose)
    bass = B.quantise(data["tracks"][2]["notes"], transpose)
    first = min(n[0] for n in mel + bass)
    offset = first - (first % B.BAR)
    expected = {1: [], 2: []}
    for staff, notes in ((1, mel), (2, bass)):
        for start, dur, pitch in notes:
            expected[staff].append((start - offset, dur, pitch))
    return expected


def main():
    ok = True
    schema = None
    if "--xsd" in sys.argv:
        from lxml import etree as LET

        schema = LET.XMLSchema(LET.parse(sys.argv[sys.argv.index("--xsd") + 1]))
    for name, transpose, fifths in (
        ("canon-practice-f.musicxml", 0, -1),
        ("canon-in-d.musicxml", -3, 2),
    ):
        path = HERE / name
        measures, got = read_xml(path)
        expected = source_expectation(transpose, len(measures))
        root = ET.parse(path).getroot()
        key = int(root.find("part/measure/attributes/key/fifths").text)
        assert key == fifths, (key, fifths)
        if schema is not None:
            from lxml import etree as LET

            valid = schema.validate(LET.parse(path))
            print(f"{'OK  ' if valid else 'FAIL'} {name} MusicXML 4.0 schema: {valid}")
            ok = ok and valid
        for staff in (1, 2):
            g = sorted(tuple(x) for x in got[staff])
            e = sorted(tuple(x) for x in expected[staff])
            if g != e:
                ok = False
                print(f"FAIL {name} staff {staff}: {len(g)} vs {len(e)}")
                missing = [x for x in e if x not in g][:5]
                extra = [x for x in g if x not in e][:5]
                print("   missing", missing)
                print("   extra  ", extra)
            else:
                print(f"OK   {name} staff {staff}: {len(g)} notes match source "
                      f"(onset/duration/pitch exact)")
        # lowest/highest sounding pitch
        allnotes = got[1] + got[2]
        print(f"     range {min(n[2] for n in allnotes)}..{max(n[2] for n in allnotes)} "
              f"MIDI, {len(allnotes)} notes, {len(measures)} bars")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
