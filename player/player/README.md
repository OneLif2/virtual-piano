# Virtual Piano — Songs / Demo / Play Along / Practice

A single self-contained page (`index.html`, no build step, no external assets) that mirrors the
OnlinePianist virtual-piano flow: a searchable **song library**, and the three lesson modes
**Demo**, **Play Along** and **Practice** driven by one shared timeline.

Open `index.html` directly, or serve the folder: `python -m http.server` → `/player/`.

## What each mode does

| Mode | Behaviour |
| --- | --- |
| **Demo** | Plays melody + bass hands-free. The note display follows the cursor, the progress bar tracks beats, and the bar is clickable to seek. |
| **Play Along** | The accompaniment keeps moving at the song's BPM. Every melody note you land inside a ±0.42-beat window scores a hit; notes that pass score a miss. Accuracy is shown at the end. |
| **Practice** | No clock. The next note is highlighted on the keyboard and the page advances only when you press it (chords can be entered note by note). Wrong keys are reported but never take progress away. |

Shared: 37 keys (A2–C6), pointer + multi-touch + physical keyboard input, CDE / DoReMi / QWERTY
labels, search with play history, and `?song=`, `?mode=`, `?play=`, `?beat=`, `?library=` deep links.

## Songs in the library

Nine arrangements in the page's own note syntax (`"C4 E4 G4:2 C4+E4+G4 R:0.5"`, one beat = quarter):

| Song | Key | Level |
| --- | --- | --- |
| Pachelbel's Canon (Canon in D) | F major | 2 |
| Ode to Joy | C major | 1 |
| Twinkle, Twinkle, Little Star | C major | 1 |
| Für Elise | A minor | 2 |
| Minuet in G | G major | 2 |
| Greensleeves | A minor | 2 |
| Amazing Grace | G major | 1 |
| Jingle Bells | C major | 1 |
| Sakura, Sakura | D minor (miyako-bushi) | 2 |

The Canon entry is the practice arrangement that also ships as MusicXML in
[`../scores/`](../scores/): 170 melody steps + 53 bass steps, 132 beats at 60 BPM ≈ 2:12.

All melodies are public-domain tunes; the arrangements here are simple two-part reductions written
for this page.

## Self-test

`index.html?selftest=1` runs an in-page harness and prints a report at the bottom of the window
(and sets the document title to `SELFTEST PASS n/n`). Covered: every song parses and stays inside
A2–C6, search filtering and the empty state, Practice ignoring wrong keys and advancing on the right
one, Play Along scoring a hit, Demo clock/progress, and mode switching without losing the song.

```powershell
# headless run, prints the report
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --virtual-time-budget=3000 --dump-dom (Resolve-Path .\index.html)  # add ?selftest=1 to the URL
```

Current status: **18 passed, 0 failed**.

## Deep links

```
/player/?song=canon&mode=Practice
/player/?song=ode&mode=Demo&play=1
/player/?library=1
```

Handy for screenshots and for pointing someone straight at a mode.
