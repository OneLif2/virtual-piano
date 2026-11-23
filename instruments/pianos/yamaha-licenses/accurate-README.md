# Accurate Salamander Grand for Zynthian

This is a high-quality sampleset from a Yamaha C5 with MIDI control,
allowing automated sampling.  Sampling was done by Alexander Holm in 2010.
It has every third note sampled and 16 velocity layers.  Subsequently the
Accurate Salamander Grand project by C Yamauchi perfected the tuning and
dynamic response (see link below.)

This sampleset is compressed to FLAC to reduce filespace footprint.
It's suitable for use on Zynthian, but not limited to it.

It has been tested using Sforzando V2.124 on Windows and Sfizz on Zynthian
Vangelis release.

## Features and controls

- Half-pedaling is supported.
  If your sustain pedal is a continuous controller (half-pedaling), you get normal
  half-pedaling behavior.
  If your sustain pedal is on/off, you can still get "repedaling," reducing the
  volume with a quick up-down of the pedal, and lower notes are damped less just
  as on an acoustic piano.
- CC20 - sampled release - this is the soft resonance of the note that remains
  after the damper is release back onto the string, though only when the
  sustain pedel is up. The effect is subtle.
  When enabled (CC20 > 0), this adds two voices per note as the note is released,
  when the sustain pedal is up.
- CC21 - hammer noise - the sound of the hammer falling back to normal position
  when a key is released (though only when the sustain pedal is up.)
  When enabled (CC21 > 0), this adds two voices per note as the note is released
  when the sustain pedal is up.
- CC22 - pedal noise - the sound heard when depressing or releasing the sustain
  pedal.
  When enabled (CC22 > 0), this adds two voices whenever the pedal is depressed
  or released.
- CC23 - simulated damper resonance - When the sustain pedal is down, playing
  a note causes sympathetic resonance in the strings for other notes.  This is
  often called "damper resonance."  This SFZ simulates this effect by playing
  slightly detuned soft notes matching the notes being played.
  When enabled (CC23 > 0), this adds two voices per note.
- For all CC-controlled features, the level is controlled by the CC.  High values
  are unrealistic, but allow the effect to be clearly heard.
- By default, all features are off.

On Zynthian, which uses a relatively low-powered processor, the number of
voices is limited, so it may be wise to disable these features when playing
pieces with many notes ringing at once. Each feature adds two voices per note
(or just two voices, for pedal noise) because all samples are stereo.

## Origin and Changes

This sampleset was derived from the 6.2beta2 version of the Salamander Grand
by the Accurate Salamander Grand Project at
https://www.ir.isas.jaxa.jp/~cyamauch/AccurateSalamander/ .
See README.cyamauch.txt for details, some of which don't apply to this sampleset.

That sampleset was derived from Alexander Holm's Salamander Grand;
see README.orig.txt for details.

The following changes were made:

- This sampleset is based on the "live-flat" sampleset of Accurate Salamander Grand.
  That's the low-latency version, that omits pre-strike hammer noise.
- Note sample files were converted from 24 to 16 bits.  Since these samples are normalized,
  this loses very little fidelity and saves considerable space, especially after FLAC
  data compression.
- Files were converted from wav format to FLAC lossless, saving considerable space.
- Disk space was reduced from 1.9G to 220M.
- Release times were adjusted to be longer for low notes and shorter for higher notes,
  as on a real piano.  Release time control via CC was removed.

Th samples (audio files) are CC-BY, due to Alexander Holm's original license.
Of course, there are no restrictions or requirements for music made
using the sampleset.  The SFZ file itself is CC0.

Jeff Learman
August 2026
