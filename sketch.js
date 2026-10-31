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

// ==================== 初始化与循环 ====================

// 项目使用 p5 1.x，通过 preload() 等待图片加载完成。
function preload() {
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

  // 油画纹理只生成一次，避免每帧闪烁
  buildCloudLayers();
  oilSun = buildOilOrb('sun');
  oilMoon = buildOilOrb('moon');

  // Mechanic 03 · Perlin Noise + Randomness (Tianyi Bo):
  // rebuild the painting as living brush strokes (noise-randomness.js)
  initializeNoiseRandomness(painting);
  initializeAudio();

  startedAt = millis();
  ready = true;

  renderScene(0);
  poster.style.visibility = 'hidden';
}

function draw() {
  if (!ready) return;
  updateAudio();

  const elapsed = Math.max(0, millis() - startedAt);

  // 取余数，实现每 15 秒自动重新开始
  const cycleElapsed = elapsed % DURATION;

  progress = cycleElapsed / DURATION;
  effectSeconds = cycleElapsed / 1000;

  renderScene(progress);
}

function renderScene(t) {
  // 每帧重画原图，避免叠加颜色不断累积
  blendMode(BLEND);
  // Mechanic 03 (Tianyi Bo): the moving brush-stroke painting replaces
  // the still image; the time effects below are drawn on top of it
  // (star glow follows Chenlei's night timing)
  setStarVisibility(nightEffectVisibility(t));
  displayNoiseRandomness();

  drawGradient(t);

  const sunInFront =
    1 - phase(t, SUN_FRONT_START, SUN_FRONT_END);

  // 云后太阳
  if (sunInFront < 1) {
    drawSun(t, 1 - sunInFront);
  }

  drawStarGlow(t);
  drawMoon(t);
  drawClouds(t);

  // 开场太阳位于云层前方
  if (sunInFront > 0) {
    drawSun(t, sunInFront);
  }

  drawLightsAndReflections(t);
}
