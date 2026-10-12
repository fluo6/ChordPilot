# Natural keyboard note previews

Replaced generated tones with 30 bundled Salamander Grand Piano MP3 recordings
by Alexander Holm (CC BY 3.0), totaling 2,012,677 bytes. Attribution is included
with the recordings and in the app's Help page. Every recording was verified
against its upstream Git blob hash during download.

All 88 keys select a recording within one semitone, with pitch-preserving
time stretching disabled so playback-rate adjustment produces the target pitch.
Master volume, bass compensation, natural attack/decay, a short release fade,
and cleanup on completion or failure are covered by focused tests.

Verification: 233 JavaScript tests passed with the two previously documented
baseline exclusions. A separate muted, hidden Electron integration probe loaded
the local A1 recording through the actual Audio/MediaElementAudioSource path;
the AudioContext was running and measured RMS was 0.067386. This verifies local
sample loading and non-silent audio generation, not subjective listening quality.

Source and license: https://github.com/Tonejs/audio/blob/master/salamander/README
