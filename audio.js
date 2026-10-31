// Audio mechanic — Jiarong Sun
// FFT splits the song into frequency bins; getEnergy averages a selected band.
// Reference: https://p5js.org/reference/p5.sound/p5.FFT/
const AUDIO_SETTINGS = {
  source: 'assets/Glimpse of Us.m4a',
  bass: [60, 250],
  treble: [2000, 8000],
  bassGain: 1.6,
  trebleGain: 2.8,
  waterBoost: 1.8,
  starBoost: 2.0
};

const audioState = { waterEnergy: 0, starEnergy: 0 };
let backgroundSong;
let songFFT;
let musicVolume = 0.5;

function initializeVolumeControl() {
  const control = document.getElementById('volume-control');
  const button = document.getElementById('volume-toggle');
  const panel = document.getElementById('volume-panel');
  const slider = document.getElementById('music-volume');
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
  let starTarget = 0;
  if (songFFT && backgroundSong.isPlaying()) {
    songFFT.analyze();
    waterTarget = normalizedBand(songFFT.getEnergy(...AUDIO_SETTINGS.bass), AUDIO_SETTINGS.bassGain);
    starTarget = normalizedBand(songFFT.getEnergy(...AUDIO_SETTINGS.treble), AUDIO_SETTINGS.trebleGain);
  }
  const seconds = Math.min(Math.max(deltaTime / 1000, 0), 0.1);
  audioState.waterEnergy = smoothAudioEnergy(audioState.waterEnergy, waterTarget, seconds);
  audioState.starEnergy = smoothAudioEnergy(audioState.starEnergy, starTarget, seconds);

  // 1 means the original noise-driven motion; audio adds bounded enhancement.
  setWaterRippleScale(1 + AUDIO_SETTINGS.waterBoost * audioState.waterEnergy);
  setStarTwinkleBoost(1 + AUDIO_SETTINGS.starBoost * audioState.starEnergy);
}
