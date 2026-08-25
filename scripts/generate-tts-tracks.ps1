param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$tracks = @(
  [pscustomobject]@{ Node='briefing'; Index=0; Mood='address'; Text='Contract-bearer. Your company has been summoned.' },
  [pscustomobject]@{ Node='briefing'; Index=1; Mood='title'; Text='The Ashen Beacon.' },
  [pscustomobject]@{ Node='briefing'; Index=2; Mood='narrative'; Text='The northern beacon has been dark for seven days.' },
  [pscustomobject]@{ Node='briefing'; Index=3; Mood='urgent'; Text='Without its flame, caravans and villages beyond the pass will face the next black tide without warning.' },
  [pscustomobject]@{ Node='briefing'; Index=4; Mood='narrative'; Text='At the gate, the keeper''s echo still wanders.' },
  [pscustomobject]@{ Node='briefing'; Index=5; Mood='ominous'; Text='The flame remembers every watcher... and every deserter.' },

  [pscustomobject]@{ Node='approach'; Index=0; Mood='title'; Text='The guards still obey their final order.' },
  [pscustomobject]@{ Node='approach'; Index=1; Mood='narrative'; Text='Thralls raise rusted weapons behind the broken walls.' },
  [pscustomobject]@{ Node='approach'; Index=2; Mood='ominous'; Text='Ash drifts against the wind toward the tower, feeding a ritual that still draws warmth from the mountain.' },

  [pscustomobject]@{ Node='after-outer'; Index=0; Mood='title'; Text='There is time for one search.' },
  [pscustomobject]@{ Node='after-outer'; Index=1; Mood='urgent'; Text='The spiral stair begins to shake.' },
  [pscustomobject]@{ Node='after-outer'; Index=2; Mood='ominous'; Text='The Warden knows you are here. There is time to investigate one place.' },

  [pscustomobject]@{ Node='camp'; Index=0; Mood='title'; Text='A breath beneath the spiral stair.' },
  [pscustomobject]@{ Node='camp'; Index=1; Mood='ominous'; Text='The ritual pulse quickens.' },
  [pscustomobject]@{ Node='camp'; Index=2; Mood='narrative'; Text='The company can prepare in only one way.' },

  [pscustomobject]@{ Node='boss-intro'; Index=0; Mood='title'; Text='The Warden forged himself into his final command.' },
  [pscustomobject]@{ Node='boss-intro'; Index=1; Mood='ominous'; Text='The brazier has become an inverted black flame.' },
  [pscustomobject]@{ Node='boss-intro'; Index=2; Mood='ominous'; Text='Two ritual pylons feed power into the armored giant.' },
  [pscustomobject]@{ Node='boss-intro'; Index=3; Mood='urgent'; Text='Disabling them weakens his defense, but costs precious actions.' },
  [pscustomobject]@{ Node='boss-intro'; Index=4; Mood='ominous'; Text='The beacon must endure. Those below it need not.' },

  [pscustomobject]@{ Node='final-choice'; Index=0; Mood='title'; Text='The black flame awaits a new command.' },
  [pscustomobject]@{ Node='final-choice'; Index=1; Mood='ominous'; Text='With the Warden fallen, the beacon can be defined one final time.' },
  [pscustomobject]@{ Node='final-choice'; Index=2; Mood='narrative'; Text='Those below will remember your choice.' },

  [pscustomobject]@{ Node='ending-rekindled'; Index=0; Mood='title'; Text='The pass sees light again.' },
  [pscustomobject]@{ Node='ending-rekindled'; Index=1; Mood='reflective'; Text='The first caravan sees the beacon before dawn.' },
  [pscustomobject]@{ Node='ending-rekindled'; Index=2; Mood='reflective'; Text='The company''s name travels down the mountain road, and the black tide turns elsewhere.' },

  [pscustomobject]@{ Node='ending-sealed'; Index=0; Mood='title'; Text='The beacon becomes an ordinary ruin.' },
  [pscustomobject]@{ Node='ending-sealed'; Index=1; Mood='reflective'; Text='The villages build watchtowers and bell posts.' },
  [pscustomobject]@{ Node='ending-sealed'; Index=2; Mood='reflective'; Text='They lose an ancient miracle and, for the first time, hold their fate in their own hands.' },

  [pscustomobject]@{ Node='ending-claimed'; Index=0; Mood='title'; Text='The company gains a flame that breathes.' },
  [pscustomobject]@{ Node='ending-claimed'; Index=1; Mood='ominous'; Text='The black flame burns quietly in the reliquary.' },
  [pscustomobject]@{ Node='ending-claimed'; Index=2; Mood='ominous'; Text='It will lend power to the next contract... and count softly on every unwatched night.' }
)

$performance = @{
  address    = @{ Rate='-8%';  Pitch='-6%' }
  title      = @{ Rate='-15%'; Pitch='-10%' }
  narrative  = @{ Rate='-4%';  Pitch='-3%' }
  urgent     = @{ Rate='+2%';  Pitch='+1%' }
  ominous    = @{ Rate='-18%'; Pitch='-12%' }
  reflective = @{ Rate='-10%'; Pitch='-6%' }
}

$voiceName = 'Microsoft Zira Desktop'
$outputRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public\voice\en'))
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$synth.SelectVoice($voiceName)
$synth.Volume = 100

try {
  foreach ($track in $tracks) {
    $fileName = '{0}-{1:d2}.wav' -f $track.Node, $track.Index
    $path = Join-Path $outputRoot $fileName
    if (-not $Force -and (Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 44) {
      Write-Host "skip $fileName"
      continue
    }
    $direction = $performance[$track.Mood]
    $escaped = [Security.SecurityElement]::Escape($track.Text)
    $ssml = "<speak version=`"1.0`" xmlns=`"http://www.w3.org/2001/10/synthesis`" xml:lang=`"en-US`"><voice name=`"$voiceName`"><prosody rate=`"$($direction.Rate)`" pitch=`"$($direction.Pitch)`">$escaped</prosody></voice></speak>"
    $synth.SetOutputToWaveFile($path, $format)
    $synth.SpeakSsml($ssml)
    $synth.SetOutputToNull()
    Write-Host "wrote $fileName"
  }
}
finally {
  $synth.Dispose()
}

$totalBytes = (Get-ChildItem -LiteralPath $outputRoot -Filter '*.wav' | Measure-Object -Property Length -Sum).Sum
Write-Host ("Generated {0} tracks ({1:N1} MB) with {2}." -f $tracks.Count, ($totalBytes / 1MB), $voiceName)
