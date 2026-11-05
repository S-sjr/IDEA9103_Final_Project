// Audio mechanic — Jiarong Sun
// FFT splits the song into frequency bins; getEnergy averages a selected band.
// Reference: https://p5js.org/reference/p5.sound/p5.FFT/
const AUDIO_SETTINGS = {
  source: 'assets/Glimpse of Us.m4a',
  bass: [60, 250],
  bassGain: 1.6,
  starResponseCurve: 0.6, // Below 1 lifts quiet accents without raising silence.
  starReferenceVolume: 0.3,
  starMaxCompensation: 3, // Limit amplification at very low listening volumes.
  starMinDecibels: -120, // Retain quiet details that the default -100 dB floor discards.
  waterBoost: 3.6, // Extra water motion at full bass energy (previously 1.8).
  starPulseStrength: 1.8, // Direct brightness response to each group's musical band.
  starGroups: [
    // This recording has much stronger midrange than upper treble.
    // Separate gains balance the bands without forcing equal brightness.
    { band: [500, 1500], gain: 0.7, attack: 0.035, release: 0.18 },
    { band: [1500, 3000], gain: 2, attack: 0.09, release: 0.32 },
    { band: [3000, 6000], gain: 6, attack: 0.16, release: 0.48 }
  ]
};

const audioState = { waterEnergy: 0, starEnergies: AUDIO_SETTINGS.starGroups.map(() => 0) };
let backgroundSong;
let songFFT;
let starFFT;
let musicVolume = 0.1;

function initializeVolumeControl() {
  const control = document.getElementById('volume-control');
  const button = document.getElementById('volume-toggle');
  const panel = document.getElementById('volume-panel');
  const slider = document.getElementById('music-volume');
  slider.value = String(musicVolume);
  const setOpen = open => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(panel.hidden));
  slider.addEventListener('input', () => {
    musicVolume = Number(slider.value);
    if (backgroundSong && backgroundSong.isLoaded()) backgroundSong.setVolume(musicVolume, 0.05);
  });
  document.addEventListener('pointerdown', event => {
    if (!control.contains(event.target)) setOpen(false);
  });
  control.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setOpen(false);
      button.focus();
    }
  });
}

// Start only when both the decoded song and the browser audio context are ready.
function startBackgroundMusic() {
  if (!songFFT || getAudioContext().state !== 'running' || backgroundSong.isPlaying()) return;
  backgroundSong.loop();
  document.removeEventListener('pointerdown', unlockBackgroundAudio);
  document.removeEventListener('keydown', unlockBackgroundAudio);
}

function unlockBackgroundAudio() {
  // A gesture may happen before decoding finishes; the load callback also starts playback.
  userStartAudio().then(startBackgroundMusic).catch(error => {
    console.error('Audio activation failed:', error);
  });
}

// Load independently of preload(): an unavailable song must not stop the painting.
function initializeAudio() {
  initializeVolumeControl();
  document.addEventListener('pointerdown', unlockBackgroundAudio);
  document.addEventListener('keydown', unlockBackgroundAudio);
  backgroundSong = loadSound(AUDIO_SETTINGS.source, () => {
    backgroundSong.setVolume(musicVolume);
    songFFT = new p5.FFT(0.65, 1024);
    songFFT.setInput(backgroundSong);
    // A separate analyser keeps the water's existing sensitivity unchanged.
    starFFT = new p5.FFT(0.65, 1024);
    starFFT.setInput(backgroundSong);
    starFFT.analyser.minDecibels = AUDIO_SETTINGS.starMinDecibels;
    startBackgroundMusic();
  }, error => {
    document.removeEventListener('pointerdown', unlockBackgroundAudio);
    document.removeEventListener('keydown', unlockBackgroundAudio);
    console.error('Audio loading failed:', error);
  });
}

function normalizedBand(energy, gain) {
  // A small noise floor avoids amplifying almost-silent sections.
  return Math.min(1, Math.max(0, (energy / 255 - 0.035) * gain));
}

function smoothAudioEnergy(current, target, seconds) {
  // Fast attack, slower release; elapsed-time smoothing works at different FPS.
  const response = target > current ? 0.09 : 0.35;
  return current + (target - current) * (1 - Math.exp(-seconds / response));
}

function updateAudio() {
  let waterTarget = 0;
  const starTargets = AUDIO_SETTINGS.starGroups.map(() => 0);
  if (songFFT && backgroundSong.isPlaying()) {
    songFFT.analyze();
    starFFT.analyze();
    waterTarget = normalizedBand(songFFT.getEnergy(...AUDIO_SETTINGS.bass), AUDIO_SETTINGS.bassGain);
    const volume = Math.max(0, backgroundSong.getVolume());
    const compensation = Math.min(AUDIO_SETTINGS.starMaxCompensation,
      Math.max(1, AUDIO_SETTINGS.starReferenceVolume / Math.max(volume, 0.01)));
    AUDIO_SETTINGS.starGroups.forEach((group, i) => {
      const energy = starFFT.getEnergy(...group.band) / 255 * group.gain * compensation;
      // Soft compression preserves differences instead of clipping all groups to 1.
      // Lift quiet musical details; exact silence and mute still produce zero.
      starTargets[i] = volume > 0.001
        ? Math.pow(energy / (1 + energy), AUDIO_SETTINGS.starResponseCurve) : 0;
    });
  }
  const seconds = Math.min(Math.max(deltaTime / 1000, 0), 0.1);
  audioState.waterEnergy = smoothAudioEnergy(audioState.waterEnergy, waterTarget, seconds);
  AUDIO_SETTINGS.starGroups.forEach((group, i) => {
    const current = audioState.starEnergies[i];
    const response = starTargets[i] > current ? group.attack : group.release;
    audioState.starEnergies[i] += (starTargets[i] - current) * (1 - Math.exp(-seconds / response));
  });

  // 1 means the original noise-driven motion; audio adds bounded enhancement.
  setWaterRippleScale(1 + AUDIO_SETTINGS.waterBoost * audioState.waterEnergy);
  setStarMusicPulses(audioState.starEnergies.map(energy => AUDIO_SETTINGS.starPulseStrength * energy));
}
