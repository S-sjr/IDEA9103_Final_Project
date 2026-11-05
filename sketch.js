let painting;
let paintingLoadFailed = false;
let ready = false;
let progress = 0;
let startedAt = 0;
let effectSeconds = 0;

let cloudMask;
let cloudShade;
let cloudTint;
let cloudPaintFrames = [];

let oilSun;
let oilMoon;

// ==================== Initialization and animation loop ====================

// The project uses p5 1.x; preload() waits for images to finish loading.
function preload() {
  preloadCoupleInput();
  const poster = document.getElementById('painting-source');

  painting = loadImage(poster.src, undefined, () => {
    paintingLoadFailed = true;
    poster.style.visibility = 'visible';
  });
}

function setup() {
  pixelDensity(1);

  const poster = document.getElementById('painting-source');

  if (paintingLoadFailed || !painting || !painting.width || !painting.height) {
    poster.style.visibility = 'visible';
    noCanvas();
    noLoop();
    return;
  }

  createCanvas(
    CANVAS_WIDTH,
    Math.round(CANVAS_WIDTH * painting.height / painting.width)
  ).parent('scene');

  colorMode(RGB, 255);
  frameRate(30);

  describe(
    'A riverside oil painting on a fifteen-second loop: the sun sets, sunset colours fade, ' +
    'clouds disperse, the moon rises, and stars and reflected lights gradually brighten.'
  );

  // Generate oil-paint textures once to prevent frame-to-frame flicker.
  buildCloudLayers();
  oilSun = buildOilOrb('sun');
  oilMoon = buildOilOrb('moon');

  // Mechanic 03 · Perlin Noise + Randomness (Tianyi Bo):
  // rebuild the painting as living brush strokes (noise-randomness.js)
  initializeNoiseRandomness(painting);
  initializeAudio();
  setupRiverInput();

  startedAt = millis();
  ready = true;

  renderScene(0);
  poster.style.visibility = 'hidden';
}

function draw() {
  if (!ready) return;
  updateAudio();
  updateRiverInput();

  const elapsed = Math.max(0, millis() - startedAt);

  // Each cycle lasts 230 seconds, then resets directly to the opening sunset.
  const cycleElapsed = elapsed % CYCLE_DURATION;

  progress = sceneProgress(cycleElapsed);

  // Stars and reflections continue shimmering during the night hold.
  effectSeconds = cycleElapsed / 1000;

  renderScene(progress);
}

function sceneProgress(elapsed) {
  // 0–5 seconds: hold the sunset.
  // 5–20 seconds: the sun sets and the moon rises.
  // 20–230 seconds: hold the full night scene.
  return constrain(
    (Math.max(0, elapsed) - SUNSET_HOLD_DURATION) / DURATION,
    0,
    1
  );
}

function cycleProgress(elapsed) {
  const cycleElapsed = Math.max(0, elapsed) % CYCLE_DURATION;

  // Hold the sunset for the first 5 seconds (legacy helper; draw uses sceneProgress).
  if (cycleElapsed < SUNSET_HOLD_DURATION) {
    return 0;
  }

  // Subtract the initial 5-second hold before calculating the transition.
  const transitionElapsed = cycleElapsed - SUNSET_HOLD_DURATION;

  // From 5 to 20 seconds, gradually transition from sunset to night.
  if (transitionElapsed < DURATION) {
    return transitionElapsed / DURATION;
  }

  // Hold the full night scene for NIGHT_HOLD_DURATION.
  if (transitionElapsed < DURATION + NIGHT_HOLD_DURATION) {
    return 1;
  }

  // Legacy return-to-sunset branch; unreachable with the current cycle duration.
  return 1 -
    (transitionElapsed - DURATION - NIGHT_HOLD_DURATION) / DURATION;
}

function renderScene(t) {
  // Redraw the painted scene each frame to prevent colour overlays accumulating.
  blendMode(BLEND);
  // Mechanic 03 (Tianyi Bo): the moving brush-stroke painting replaces
  // the still image; the time effects below are drawn on top of it
  // (star glow follows Chenlei's night timing)
  setStarVisibility(nightEffectVisibility(t));
  displayNoiseRandomness();

  drawGradient(t);

  const sunInFront =
    1 - phase(t, SUN_FRONT_START, SUN_FRONT_END);

  // Draw the sun behind the clouds.
  if (sunInFront < 1) {
    drawSun(t, 1 - sunInFront);
  }

  drawStarGlow(t);
  drawMoon(t);
  drawClouds(t);

  // At the opening, draw the sun in front of the clouds.
  if (sunInFront > 0) {
    drawSun(t, sunInFront);
  }

  drawLightsAndReflections(t);
  drawCoupleInput();
}
