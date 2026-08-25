# TTS tracks

The current English DM tracks are offline prototype assets generated with the locally installed `Microsoft Zira Desktop` Windows voice through `System.Speech`.

- Generator: `scripts/generate-tts-tracks.ps1`
- Output: `public/voice/en/*.wav`
- Format: 16 kHz, 16-bit, mono PCM WAV
- Current scope: 32 segments, approximately 119 seconds
- Runtime dependency: none; browsers play ordinary WAV files

These files validate narration timing, subtitles, music ducking, and adaptive soundscape cues. No commercial distribution clearance is claimed for the prototype voice. Replace the tracks with human performance or a commercially licensed TTS provider before a commercial release.
