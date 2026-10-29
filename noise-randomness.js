// =====================================================================
// noise-randomness.js
// Mechanic 03 · Perlin Noise + Randomness — Tianyi Bo
// "Starry Night Over the Rhône" — repainted stroke by stroke, and alive
//
// IDEA
//   The original image is never shown. It is only used as a hidden
//   "underdrawing": tens of thousands of short brush strokes read their
//   colour and direction from it and are painted onto an empty canvas,
//   each with bristle marks, like an oil painting being made by hand.
//   Then the painting keeps moving:
//     · Sky     – long strokes flow along a shared Perlin-noise field; each
//                 takes a random blue (deep → light) and patches of colour
//                 drift with noise; thin clouds form, drift and dissolve at
//                 random
//   (water and grass movement: next iteration)
//
// RANDOMNESS (chosen once, when the painting is built)
//   randomSeed() + noiseSeed() → one seed number reproduces the whole work
//   random() → stroke positions, length, slight colour variation,
//              painting order, personal noise offsets and speeds
// PERLIN NOISE (read every frame with small time steps → smooth motion)
//   noise(x, y, t)      shared fields: neighbouring strokes move together
//   noise(offset + t)   each stroke's own small wobble
//
// FOUR LAYERS OF STROKES (like a painter working from big to small)
//   1. underpainting – big soft strokes, cover the canvas, never move
//   2. main          – medium strokes, carry the picture, move by region
//   3. detail        – smaller dabs only where the image has edges
//   4. fine          – small dabs on top for boats, figures, town lights
//
// HOW sketch.js USES THIS FILE
//   setup():  initializeNoiseRandomness(paintingImage);  (after createCanvas)
//   draw():   displayNoiseRandomness();
//
// TECHNIQUES FROM OUTSIDE THE COURSE (explained where they are used)
//   · drawingContext — the browser's Canvas 2D API, used directly because
//     it is much faster than p5 line() for this many strokes.
//     https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D
//   · Structure tensor — finds the main direction of texture in an image,
//     used to point every stroke along the painting's own brushwork.
//     https://en.wikipedia.org/wiki/Structure_tensor
//   · k-means colour clustering — reduces stroke colours to a palette so
//     strokes can be drawn in large batches (performance).
//     https://en.wikipedia.org/wiki/K-means_clustering
//
// AI ACKNOWLEDGEMENT: written with the help of Claude (Anthropic, Opus 5.5).
// Claude proposed the stroke-by-stroke repainting approach, the three
// layers, the region rules and the performance techniques, and wrote the
// code and comments. Tianyi Bo directed the look, tested and tuned it.
// =====================================================================


// ---------------------------------------------------------------------
// SETTINGS — sizes are for a 1024px-wide canvas and scale with it
// ---------------------------------------------------------------------

// Strokes are short, broad, soft dabs of colour that overlap and blend
// (alpha < 1), rather than thin streaks.
//   texture: strength of the faint lighter streak inside each dab
const STROKE_LAYERS = {
  underpainting: { spacing: 14,  minLength: 20, maxLength: 30, width: 16,  blur: 10, alpha: 0.9,  texture: 0 },
  main:          { spacing: 6.5, minLength: 9,  maxLength: 14, width: 8.5, blur: 7,  alpha: 0.6,  texture: 0.07 },
  detail:        { spacing: 5,   minLength: 6,  maxLength: 9,  width: 5,   blur: 3,  alpha: 0.65, texture: 0.05 },
  fine:          { spacing: 3.2, minLength: 3,  maxLength: 5,  width: 3.8, blur: 1.4, alpha: 0.85, texture: 0 }
};
const PALETTE_SIZE = 64;        // colours after k-means (fewer = faster)
const PAINT_IN_SECONDS = 3.0;   // the opening "painting itself" animation

// How strongly each region moves (1 = default)
let motionSettings = {
  skyFlow: 1
};

// Regions of the painting as ratios of width/height
// (measured on the original with a grid overlay)
const SKY_BOTTOM = 0.40;
const TOWN_BOTTOM = 0.48;
const NEAR_BANK_LINE = [
  [0.00, 0.86], [0.20, 0.84], [0.40, 0.80], [0.50, 0.775],
  [0.60, 0.765], [0.80, 0.765], [1.00, 0.775]
];
// Areas whose outlines (masts, hulls, figures) get extra-small strokes
const DETAIL_AREAS = [
  { x1: 0.09, y1: 0.32, x2: 0.18, y2: 0.47 }    // church tower
];
// The couple and the boats are too small and detailed to repaint with
// dabs, so these parts of the original are shown through soft oval windows
// (feathered edge, so it melts into the strokes around it).
const ORIGINAL_PATCHES = [
  { cx: 0.774, cy: 0.892, rx: 0.068, ry: 0.125 },  // the couple
  { cx: 0.555, cy: 0.700, rx: 0.185, ry: 0.045 },  // boat hulls
  { cx: 0.505, cy: 0.600, rx: 0.016, ry: 0.085 },  // left mast
  { cx: 0.590, cy: 0.600, rx: 0.016, ry: 0.085 },  // middle mast
  { cx: 0.715, cy: 0.600, rx: 0.016, ry: 0.085 }   // right mast
];

// Sky blues, deep → light. Sky strokes pick from these at random
// (around the painting's own brightness) and drift between them.
const SKY_SHADES = [
  [14, 28, 72], [20, 42, 102], [28, 60, 134], [36, 80, 156], [48, 100, 172],
  [66, 122, 184], [92, 146, 196], [124, 170, 206], [160, 196, 220]
];
const SKY_SHADE_STYLES = SKY_SHADES.map(c => 'rgb(' + c.join(',') + ')');

// ---------------------------------------------------------------------
// GLOBAL STATE (kept between frames)
// ---------------------------------------------------------------------

let staticLayer;            // p5.Graphics: strokes that never move
let staticStrokes = [];     // painted into staticLayer during the intro
let fineLayer;              // transparent p5.Graphics drawn ON TOP of the motion
let patchLayer;             // original-painting windows (couple, boats)
let fineStrokes = [];       // tiny detail strokes for fineLayer
let movingStrokes = [];     // redrawn every frame
let strokeBatches = [];     // movingStrokes grouped by colour + layer
let cloudWisps = [];
let palette = [];           // k-means colours
let paletteStyles = [];     // the same colours as CSS strings

let flowTime = 0;           // shared time input for every noise() call
let paintInStart = 0;
let staticPaintedCount = 0;
let finePaintedCount = 0;
let brushScale = 1;
let currentSeed = 0;
let canvasGrain;            // fine canvas texture over the paint

// Noise read on a coarse grid once per frame, shared by many strokes
const FIELD_COLUMNS = 72;
const FIELD_ROWS = 56;
let skyField;               // sky turn + slide + colour drift

// 1D Perlin curve sampled once; personal motion reads it with an offset
// (same values as calling noise() each time, far cheaper for 30k strokes)
const NOISE_TABLE_SIZE = 4096;
let noiseTable;

// ---------------------------------------------------------------------
// ENTRY FUNCTIONS
// ---------------------------------------------------------------------

// Builds the whole painting from the source image (called in setup and
// again after a window resize). seed is optional.
function initializeNoiseRandomness(sourceImage, seed) {
  currentSeed = (seed === undefined) ? floor(random(100000)) : seed;
  randomSeed(currentSeed);
  noiseSeed(currentSeed);
  brushScale = width / 1024;

  // Personal-motion curve (1D Perlin noise)
  noiseTable = new Float32Array(NOISE_TABLE_SIZE);
  for (let i = 0; i < NOISE_TABLE_SIZE; i++) noiseTable[i] = noise(i * 0.045, 777);

  // Colour sources: smaller copies = softer colour (average of an area)
  let colourSources = {};
  for (let name in STROKE_LAYERS) {
    let blur = STROKE_LAYERS[name].blur;
    let img = sourceImage.get();
    img.resize(max(8, round(width / blur)), max(8, round(height / blur)));
    img.loadPixels();
    colourSources[name] = { img, blur };
  }
  let field = buildDirectionField(sourceImage, 256, 3);
  let fineField = buildDirectionField(sourceImage, 640, 2);   // sharper, for tiny strokes

  // Generate the three layers of strokes
  staticStrokes = [];
  movingStrokes = [];
  fineStrokes = [];
  for (let name of ['underpainting', 'main', 'detail', 'fine']) {
    let layer = STROKE_LAYERS[name];
    let spacing = layer.spacing * brushScale;
    for (let y = 0; y < height; y += spacing) {
      for (let x = 0; x < width; x += spacing) {
        let px = constrain(x + random(-0.5, 0.5) * spacing, 0, width - 1);
        let py = constrain(y + random(-0.5, 0.5) * spacing, 0, height - 1);
        let u = px / width, v = py / height;
        let inDetailArea = isDetailArea(u, v);

        // detail strokes: only where the image has edges (not on open water,
        // where small strokes look like mosaic)
        if (name === 'detail' && (inDetailArea || field.edgeAt(u, v) < 0.36)) continue;
        let onWater = v > TOWN_BOTTOM && v < nearBankY(u);
        if (name === 'detail' && onWater) {
          // ...except the columns of light, which get extra golden strokes
          let c2 = readPixel(colourSources.detail.img, px / colourSources.detail.blur, py / colourSources.detail.blur);
          if (!(c2[0] > 160 && c2[1] > 140 && c2[2] < 120)) continue;
        }
        // sky: fewer, longer strokes, no small detail strokes
        if (v < SKY_BOTTOM - 0.01 && name === 'detail') continue;
        if (v < SKY_BOTTOM - 0.01 && name === 'main' && random() < 0.35) continue;
        // water uses fewer, longer strokes
        let preview = readPixel(colourSources.main.img, px / colourSources.main.blur, py / colourSources.main.blur);
        let goldenHere = preview[0] > 150 && preview[1] > 130 && preview[2] < 120;
        if (name === 'main' && onWater && !goldenHere && random() < 0.45) continue;
        // fine strokes: only on real outlines (masts, hulls, the couple's
        // dark shapes, town edges) so no "patch" shows around them
        let source = colourSources[name];
        let colour = readPixel(source.img, px / source.blur, py / source.blur);
        if (name === 'fine') {
          let inTown = v > SKY_BOTTOM - 0.02 && v < TOWN_BOTTOM + 0.01;
          let edge = fineField.edgeAt(u, v);
          let dark = brightness3(colour) < 55;
          let keep = (inDetailArea && (edge > 0.22 || dark)) || (inTown && field.edgeAt(u, v) > 0.1);
          if (!keep) continue;
        }
        let angle = (name === 'fine') ? fineField.angleAt(u, v) : field.angleAt(u, v);
        let stroke = new BrushStroke(px, py, colour, angle, name, inDetailArea);

        if (name === 'fine') fineStrokes.push(stroke);
        else if (stroke.isStatic) staticStrokes.push(stroke);
        else movingStrokes.push(stroke);
      }
    }
  }

  // Random painting order — the canvas fills like a painter at work
  staticStrokes = shuffle(staticStrokes);
  // ...but big strokes first, then main, then detail
  staticStrokes.sort((a, b) => a.layerOrder - b.layerOrder);
  fineStrokes = shuffle(fineStrokes);

  // Palette + batches for fast drawing of the moving strokes
  palette = buildPalette(movingStrokes.concat(staticStrokes).map(s => s.colour), PALETTE_SIZE);
  paletteStyles = palette.map(c => rgbString(...c));
  buildStrokeBatches();

  // Clouds: a few to start with, more appear at random later
  cloudWisps = [];
  for (let i = 0; i < 4; i++) cloudWisps.push(new CloudWisp(random(0.2, 0.7)));

  // Empty canvas to paint on
  staticLayer = createGraphics(width, height);
  staticLayer.pixelDensity(1);
  staticLayer.background(18, 24, 38);
  fineLayer = createGraphics(width, height);
  fineLayer.pixelDensity(1);
  fineLayer.clear();
  staticPaintedCount = 0;
  finePaintedCount = 0;
  patchLayer = buildOriginalPatches(sourceImage);
  canvasGrain = buildCanvasGrain();

  skyField = new Float32Array(FIELD_COLUMNS * FIELD_ROWS * 3);
  paintInStart = millis();
}

// Draws one frame of the living painting.
function displayNoiseRandomness() {
  let ctx = drawingContext;
  let progress = paintInProgress();

  // 1. Keep painting the still strokes into the static layer (intro)
  paintStaticStrokes(progress);
  ctx.drawImage(staticLayer.elt, 0, 0, width, height);

  // 2. Shared noise for this frame
  updateNoiseFields();

  // 3. Moving strokes
  for (let s of movingStrokes) s.update();
  let revealed = constrain(map(progress, 0.25, 1, 0, 1), 0, 1);
  ctx.save();
  ctx.lineCap = 'round';
  drawSkyStrokes(ctx, revealed);
  drawBatches(ctx, revealed);
  ctx.restore();

  // The couple and boats, from the original painting
  ctx.save();
  ctx.globalAlpha = constrain(map(progress, 0.6, 1, 0, 1), 0, 1);
  ctx.drawImage(patchLayer.elt, 0, 0, width, height);
  ctx.restore();

  // Fine details on top, so the motion never blurs boats and figures
  paintFineStrokes(constrain(map(progress, 0.5, 1, 0, 1), 0, 1));
  ctx.drawImage(fineLayer.elt, 0, 0, width, height);

  // 4. Clouds drift across the sky
  let cloudReveal = constrain(map(progress, 0.55, 1, 0, 1), 0, 1);
  if (cloudReveal > 0) updateAndDrawClouds(ctx, cloudReveal);

  // 5. Canvas texture
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(canvasGrain.elt, 0, 0, width, height);
  ctx.restore();

  flowTime += 0.016;
  checkPerformance(progress);
}

// Safety for slower computers: if the frame rate stays low after the
// intro, half of the moving sky strokes are painted into the still layer
// (they stop moving) so each frame has less to draw. Repeats if needed.
let slowFrames = 0;
function checkPerformance(progress) {
  if (progress < 1) return;
  slowFrames = (frameRate() < 22) ? slowFrames + 1 : 0;
  if (slowFrames < 60) return;          // about 2-3 seconds of slow frames
  slowFrames = 0;
  if (skyStrokes.length < 1500) return;  // keep enough motion
  let ctx = staticLayer.drawingContext;
  ctx.save();
  ctx.lineCap = 'round';
  let keep = [];
  for (let st of movingStrokes) {
    if (st.isSkyStroke && random() < 0.5) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = SKY_SHADE_STYLES[st.currentShade || st.skyShade];
      ctx.lineWidth = st.thickness;
      line2d(ctx, st.x1, st.y1, st.x2, st.y2);
    }
    else keep.push(st);
  }
  ctx.restore();
  movingStrokes = keep;
  buildStrokeBatches();
}

function reseedNoiseRandomness(sourceImage) {
  initializeNoiseRandomness(sourceImage, floor(random(100000)));
}

function paintInProgress() {
  let t = constrain((millis() - paintInStart) / (PAINT_IN_SECONDS * 1000), 0, 1);
  return t * t * (3 - 2 * t);
}

// Paints the next share of still strokes so the canvas fills over time
function paintStaticStrokes(progress) {
  let target = floor(progress * staticStrokes.length);
  if (target <= staticPaintedCount) return;
  let ctx = staticLayer.drawingContext;
  ctx.save();
  ctx.lineCap = 'round';  // soft rounded brush tip
  for (let i = staticPaintedCount; i < target; i++) {
    staticStrokes[i].drawSingle(ctx);
  }
  ctx.restore();
  staticPaintedCount = target;
}


function paintFineStrokes(progress) {
  let target = floor(progress * fineStrokes.length);
  if (target <= finePaintedCount) return;
  let ctx = fineLayer.drawingContext;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = finePaintedCount; i < target; i++) fineStrokes[i].drawSingle(ctx);
  ctx.restore();
  finePaintedCount = target;
}


// ---------------------------------------------------------------------
// CLASS 1: BrushStroke — one dab of paint with bristle marks
// ---------------------------------------------------------------------
class BrushStroke {
  constructor(x, y, colour, imageAngle, layerName, inDetailArea) {
    let layer = STROKE_LAYERS[layerName];
    this.x = x;
    this.y = y;
    this.layerName = layerName;
    this.layerOrder = ['underpainting', 'main', 'detail', 'fine'].indexOf(layerName);
    this.region = classifyRegion(x / width, y / height, colour);
    this.length = random(layer.minLength, layer.maxLength) * brushScale;
    this.thickness = layer.width * brushScale;
    this.alpha = layer.alpha;
    this.texture = layer.texture;
    if (this.region === 'water' && layerName === 'main') {
      this.alpha = 0.42;     // soft, overlapping water strokes blend smoothly
      this.texture = 0.08;
    }

    // Still strokes: the underpainting, the town, and open water (the water
    // moves as one surface — see drawWaterSurface)
    this.isStatic = layerName === 'underpainting' || this.region === 'town' ||
                    this.region === 'water' || this.region === 'reflection' ||
                    this.region === 'grass';

    // Direction: follow the painting, with each region's habit
    if (this.region === 'water' || this.region === 'reflection') {
      this.angle = lerpAngle(imageAngle, 0, 0.95);                  // long flat strokes
      this.length *= (this.region === 'reflection') ? 1.4 : 3.0;
      this.thickness *= (this.region === 'reflection') ? 0.9 : 0.65;
    } else if (this.region === 'grass') {
      this.angle = lerpAngle(imageAngle, -HALF_PI * 0.7, 0.3);      // upward blades
      this.length *= 1.25;
    } else if (this.region === 'sky') {
      this.angle = lerpAngle(imageAngle, 0, 0.55);
      if (layerName === 'main') {
        // longer, mostly horizontal strokes, like the painting's sky
        this.angle = lerpAngle(imageAngle, 0, 0.8);
        this.length *= 1.45;
        this.thickness *= 1.2;
      }
    } else {
      this.angle = imageAngle;
    }
    if (layerName === 'fine') this.angle = imageAngle;   // follow outlines exactly
    this.angle += random(-0.07, 0.07);     // small, so neighbours stay aligned

    // Every stroke shifts its colour slightly at random, so the paint
    // looks hand-mixed without becoming noisy
    // (one shared shift for all three channels keeps the hue clean)
    let spread = (layerName === 'fine') ? 3 : 5;
    let shift = random(-spread, spread);
    let c = colour.map(v => v + shift + random(-2, 2));
    this.colour = c.map(v => constrain(v, 0, 255));
    this.bodyStyle = rgbString(...this.colour);
    this.lightStyle = rgbString(...this.colour.map(v => v + 16));

    // Sky: colour chosen at random from the sky blues, centred on the
    // painting's own brightness here (random() → visible colour variety)
    if (this.region === 'sky' && layerName === 'main') {
      let base = map(brightness3(colour), 45, 165, 0, SKY_SHADES.length - 1);
      this.skyShade = constrain(round(base + random(-1.1, 1.1)), 0, SKY_SHADES.length - 1);
      this.alpha = 0.45;
      this.texture = 0;
      this.isSkyStroke = true;
    }

    // Personal motion
    this.noiseOffset = random(NOISE_TABLE_SIZE);
    this.noiseSpeed = random(0.6, 1.5);
    this.swayAmount = random(0.6, 1.3);   // random strength per stroke
    if (this.region === 'reflection') this.swayAmount = random(0.4, 2.0);
    this.appearAt = random(0, 0.85);      // when it appears in the intro

    // Resting position (still strokes keep this; moving ones update it)
    if (this.region === 'grass') {
      this.setEnds(x, y, x + cos(this.angle) * this.length, y + sin(this.angle) * this.length);
    } else {
      let dx = cos(this.angle) * this.length * 0.5;
      let dy = sin(this.angle) * this.length * 0.5;
      this.setEnds(x - dx, y - dy, x + dx, y + dy);
    }
  }

  // Where the stroke is this frame (Perlin noise), without drawing
  update() {
    let x = this.x, y = this.y;
    let angle = this.angle;
    let length = this.length;
    let u = x / width, v = y / height;
    let personal = noiseTableAt(this.noiseOffset + flowTime * 90 * this.noiseSpeed) - 0.5;

    if (this.region === 'sky') {
      // shared flow: turn and slide with the neighbours
      let i = fieldIndex(u, v / SKY_BOTTOM);
      angle += (skyField[i] - 0.5) * 0.9 * motionSettings.skyFlow;
      let slide = (skyField[i + 1] - 0.5) * 26 * brushScale * motionSettings.skyFlow;
      x += cos(angle) * slide;
      y += sin(angle) * slide;
      angle += personal * 0.12;                         // tiny personal wobble
      length *= 1 + personal * 0.3;
      if (this.isSkyStroke) {
        // drifting patches of lighter / darker blue (Perlin noise), so
        // the colour of the sky keeps moving like thin clouds
        let shift = (skyField[i + 2] - 0.5) * 3.6;
        this.currentShade = constrain(round(this.skyShade + shift), 0, SKY_SHADES.length - 1);
      }

    }

    let dx = cos(angle) * length * 0.5;
    let dy = sin(angle) * length * 0.5;
    this.setEnds(x - dx, y - dy, x + dx, y + dy);
  }

  // Stores the stroke ends and its texture streak
  setEnds(x1, y1, x2, y2) {
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
    let len = max(0.001, dist(x1, y1, x2, y2));
    let nx = -(y2 - y1) / len * this.thickness * 0.2;
    let ny = (x2 - x1) / len * this.thickness * 0.2;
    // faint lighter streak along one side of the dab (paint texture)
    this.lx1 = lerp(x1, x2, 0.1) + nx; this.ly1 = lerp(y1, y2, 0.1) + ny;
    this.lx2 = lerp(x1, x2, 0.9) + nx; this.ly2 = lerp(y1, y2, 0.9) + ny;
  }

  drawSingle(ctx) {
    ctx.globalAlpha = this.alpha;
    ctx.strokeStyle = this.bodyStyle;
    ctx.lineWidth = this.thickness;
    line2d(ctx, this.x1, this.y1, this.x2, this.y2);
    if (this.texture <= 0) return;
    ctx.globalAlpha = this.texture;
    ctx.lineWidth = this.thickness * 0.3;
    ctx.strokeStyle = this.lightStyle;
    line2d(ctx, this.lx1, this.ly1, this.lx2, this.ly2);
  }
}

// ---------------------------------------------------------------------
// CLASS 4: CloudWisp — a thin, soft cloud that drifts, forms and fades
// ---------------------------------------------------------------------
// Made of many soft, transparent "puffs" (a pre-drawn blurry oval) laid
// along a gentle curve, so the edges stay soft like painted mist.
// random(): place, length, thickness, colour, speed, lifetime, puffs.
// noise(): the curve slowly bends and every puff swells and shrinks.
class CloudWisp {
  constructor(startAge) {
    this.x = random(-0.1, 1.0) * width;
    this.y = random(0.06, SKY_BOTTOM - 0.1) * height;
    this.span = random(160, 360) * brushScale;           // cloud length
    this.thickness = random(14, 34) * brushScale;
    this.speed = random(0.08, 0.3) * brushScale * random([-1, 1]);
    this.life = random(16, 32);                          // seconds
    this.age = (startAge || 0) * this.life;
    this.offset = random(1000);
    this.tilt = random(-0.1, 0.1);
    this.opacity = random(0.18, 0.4);
    let tone = random([[120, 156, 196], [140, 172, 205], [104, 140, 186], [160, 184, 210]]);
    this.sprite = makePuffSprite(tone);
    this.puffs = [];
    let count = floor(random(26, 44));
    for (let i = 0; i < count; i++) {
      let t = random();
      // puffs are bigger in the middle of the cloud, thin at the ends
      let body = sin(t * PI);
      this.puffs.push({
        t: t,
        across: random(-0.5, 0.5) * body,
        w: random(40, 90) * brushScale * (0.4 + body),
        h: random(10, 22) * brushScale * (0.4 + body),
        offset: random(1000)
      });
    }
  }

  update(dt) {
    this.age += dt;
    this.x += this.speed;
    return this.age < this.life && this.x > -this.span * 1.5 && this.x < width + this.span * 1.5;
  }

  draw(ctx, reveal) {
    let fade = sin(constrain(this.age / this.life, 0, 1) * PI);   // forms, then dissolves
    let base = this.opacity * fade * reveal;
    if (base < 0.01) return;
    for (let p of this.puffs) {
      let along = (p.t - 0.5) * this.span;
      let curve = (noise(p.t * 1.5, flowTime * 0.15, this.offset) - 0.5) * 50 * brushScale;
      let x = this.x + along;
      let y = this.y + along * this.tilt + curve + p.across * this.thickness;
      let breathe = 0.75 + 0.5 * noiseTableAt(p.offset + flowTime * 50);
      ctx.globalAlpha = base * breathe * 0.55;
      let w = p.w * breathe, h = p.h * breathe;
      ctx.drawImage(this.sprite, x - w / 2, y - h / 2, w, h);
    }
  }
}

// A small blurry oval drawn once per cloud: colour in the middle, fading
// to transparent at the edge (radial gradient)
function makePuffSprite(tone) {
  let c = document.createElement('canvas');
  c.width = c.height = 64;
  let g = c.getContext('2d');
  let grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(' + tone.join(',') + ',0.9)');
  grad.addColorStop(0.5, 'rgba(' + tone.join(',') + ',0.45)');
  grad.addColorStop(1, 'rgba(' + tone.join(',') + ',0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function updateAndDrawClouds(ctx, reveal) {
  let dt = min(deltaTime / 1000, 0.1);
  // a new cloud appears at a random moment (about every 5 seconds)
  if (cloudWisps.length < 8 && random() < 0.2 * dt) cloudWisps.push(new CloudWisp(0));
  cloudWisps = cloudWisps.filter(c => c.update(dt));
  ctx.save();
  // clouds stay above the town
  ctx.beginPath();
  ctx.rect(0, 0, width, SKY_BOTTOM * height);
  ctx.clip();
  for (let c of cloudWisps) c.draw(ctx, reveal);
  ctx.restore();
}


// ---------------------------------------------------------------------
// SHARED NOISE FIELDS (computed once per frame)
// ---------------------------------------------------------------------
function updateNoiseFields() {
  for (let r = 0; r < FIELD_ROWS; r++) {
    for (let c = 0; c < FIELD_COLUMNS; c++) {
      let u = c / FIELD_COLUMNS, v = (r / FIELD_ROWS) * SKY_BOTTOM;
      let i = (r * FIELD_COLUMNS + c) * 3;
      skyField[i] = noise(u * 3, v * 3, flowTime * 0.55);          // turn
      skyField[i + 1] = noise(u * 4 + 50, v * 4, flowTime * 0.45);  // slide
      skyField[i + 2] = noise(u * 2.2 - flowTime * 0.12, v * 3.5, 700); // colour drift
    }

  }
}

function fieldIndex(u, v) {
  let c = constrain(floor(u * FIELD_COLUMNS), 0, FIELD_COLUMNS - 1);
  let r = constrain(floor(v * FIELD_ROWS), 0, FIELD_ROWS - 1);
  return (r * FIELD_COLUMNS + c) * 3;
}
function columnIndex(u) { return constrain(floor(u * FIELD_COLUMNS), 0, FIELD_COLUMNS - 1); }

// Smoothly reads the pre-sampled 1D Perlin curve at any position
function noiseTableAt(position) {
  let p = ((position % NOISE_TABLE_SIZE) + NOISE_TABLE_SIZE) % NOISE_TABLE_SIZE;
  let i = floor(p);
  let f = p - i;
  return lerp(noiseTable[i], noiseTable[(i + 1) % NOISE_TABLE_SIZE], f);
}


// ---------------------------------------------------------------------
// FAST DRAWING: batches
// ---------------------------------------------------------------------
// One ctx.stroke() per stroke would be ~25,000 calls a frame (too slow).
// Strokes sharing a palette colour and layer go into one path and are
// drawn with one call. Texture streaks get their own batches.
function buildStrokeBatches() {
  let groups = new Map();
  let add = (key, style, lineWidth, alpha, part, stroke) => {
    if (!groups.has(key)) groups.set(key, { style, lineWidth, alpha, part, strokes: [], order: part === 'body' ? 0 : 1 });
    groups.get(key).strokes.push(stroke);
  };

  skyStrokes = [];
  for (let s of movingStrokes) {
    if (s.isSkyStroke) { skyStrokes.push(s); continue; }
    let k = nearestColour(palette, ...s.colour);
    let p = palette[k];
    let key = s.layerName + k;
    add('b' + key, rgbString(...p), s.thickness, s.alpha, 'body', s);
    if (s.texture > 0) {
      add('l' + key, rgbString(...p.map(v => v + 16)), s.thickness * 0.3, s.texture, 'light', s);
    }
  }
  // main layer under detail layer; bodies before bristles
  strokeBatches = [...groups.values()].sort((a, b) =>
    (a.strokes[0].layerOrder - b.strokes[0].layerOrder) || (a.order - b.order));
}

// Sky strokes change colour over time, so they are grouped by their
// current shade every frame (9 shades = 9 draw calls).
let skyStrokes = [];
function drawSkyStrokes(ctx, revealed) {
  let groups = SKY_SHADES.map(() => []);
  for (let s of skyStrokes) {
    if (s.appearAt <= revealed) groups[s.currentShade || s.skyShade].push(s);
  }
  ctx.globalAlpha = 0.45;
  for (let k = 0; k < groups.length; k++) {
    if (groups[k].length === 0) continue;
    ctx.strokeStyle = SKY_SHADE_STYLES[k];
    ctx.lineWidth = groups[k][0].thickness;
    ctx.beginPath();
    for (let s of groups[k]) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
    ctx.stroke();
  }
}

function drawBatches(ctx, revealed) {
  for (let batch of strokeBatches) {
    ctx.globalAlpha = batch.alpha;
    ctx.strokeStyle = batch.style;
    ctx.lineWidth = batch.lineWidth;
    ctx.beginPath();
    for (let s of batch.strokes) {
      if (s.appearAt > revealed) continue;
      if (batch.part === 'body') { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
      else { ctx.moveTo(s.lx1, s.ly1); ctx.lineTo(s.lx2, s.ly2); }
    }
    ctx.stroke();
  }
}

function line2d(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}


// ---------------------------------------------------------------------
// HELPERS: image analysis
// ---------------------------------------------------------------------

// Direction + edge strength of the painting's texture (structure tensor):
// measure brightness change (Sobel), smooth it, take the main direction
// and turn it 90° so strokes run ALONG the forms.
function buildDirectionField(sourceImage, fieldWidth, radius) {
  let small = sourceImage.get();
  let fieldHeight = round(fieldWidth * sourceImage.height / sourceImage.width);
  small.resize(fieldWidth, fieldHeight);
  small.loadPixels();

  let lum = new Float32Array(fieldWidth * fieldHeight);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = 0.3 * small.pixels[i * 4] + 0.59 * small.pixels[i * 4 + 1] + 0.11 * small.pixels[i * 4 + 2];
  }
  let at = (x, y) => lum[constrain(y, 0, fieldHeight - 1) * fieldWidth + constrain(x, 0, fieldWidth - 1)];

  let jxx = new Float32Array(lum.length), jyy = new Float32Array(lum.length), jxy = new Float32Array(lum.length);
  let edges = new Float32Array(lum.length);
  for (let y = 0; y < fieldHeight; y++) {
    for (let x = 0; x < fieldWidth; x++) {
      let gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      let gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let i = y * fieldWidth + x;
      jxx[i] = gx * gx; jyy[i] = gy * gy; jxy[i] = gx * gy;
      edges[i] = sqrt(gx * gx + gy * gy) / 1020;   // 0..~1
    }
  }

  let angles = new Float32Array(lum.length);
  for (let y = 0; y < fieldHeight; y++) {
    for (let x = 0; x < fieldWidth; x++) {
      let sxx = 0, syy = 0, sxy = 0;
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          let i = constrain(y + oy, 0, fieldHeight - 1) * fieldWidth + constrain(x + ox, 0, fieldWidth - 1);
          sxx += jxx[i]; syy += jyy[i]; sxy += jxy[i];
        }
      }
      angles[y * fieldWidth + x] = 0.5 * atan2(2 * sxy, sxx - syy) + HALF_PI;
    }
  }

  let index = (u, v) => constrain(floor(v * fieldHeight), 0, fieldHeight - 1) * fieldWidth +
                        constrain(floor(u * fieldWidth), 0, fieldWidth - 1);
  return {
    angleAt: (u, v) => angles[index(u, v)],
    edgeAt: (u, v) => edges[index(u, v)]
  };
}

// k-means: find PALETTE_SIZE colours that best represent all strokes
function buildPalette(colours, size) {
  let centres = [];
  for (let i = 0; i < size; i++) centres.push([...random(colours)]);
  for (let round = 0; round < 8; round++) {
    let sums = centres.map(() => [0, 0, 0, 0]);
    for (let c of colours) {
      let k = nearestColour(centres, c[0], c[1], c[2]);
      sums[k][0] += c[0]; sums[k][1] += c[1]; sums[k][2] += c[2]; sums[k][3]++;
    }
    for (let k = 0; k < size; k++) {
      centres[k] = sums[k][3] > 0
        ? [sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]]
        : [...random(colours)];
    }
  }
  return centres;
}

function nearestColour(list, r, g, b) {
  let best = 0, bestDistance = Infinity;
  for (let k = 0; k < list.length; k++) {
    let dr = list[k][0] - r, dg = list[k][1] - g, db = list[k][2] - b;
    let d = dr * dr + dg * dg + db * db;
    if (d < bestDistance) { bestDistance = d; best = k; }
  }
  return best;
}

// Cuts soft oval windows out of the original painting. The oval is
// drawn as a radial gradient (opaque centre → transparent edge) and used
// as a mask with the 'destination-in' blend mode of the Canvas 2D API.
function buildOriginalPatches(sourceImage) {
  let layer = createGraphics(width, height);
  layer.pixelDensity(1);
  layer.clear();
  for (let p of ORIGINAL_PATCHES) {
    let cx = p.cx * width, cy = p.cy * height;
    let rx = p.rx * width, ry = p.ry * height;
    let patch = createGraphics(ceil(rx * 2), ceil(ry * 2));
    patch.pixelDensity(1);
    // copy the matching piece of the original painting
    let sx = (cx - rx) / width * sourceImage.width;
    let sy = (cy - ry) / height * sourceImage.height;
    let sw = rx * 2 / width * sourceImage.width;
    let sh = ry * 2 / height * sourceImage.height;
    patch.image(sourceImage, 0, 0, patch.width, patch.height, sx, sy, sw, sh);
    // feathered oval mask
    let ctx = patch.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.translate(rx, ry);
    ctx.scale(1, ry / rx);
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
    layer.image(patch, cx - rx, cy - ry);
    patch.remove();
  }
  return layer;
}

// A fine random speckle that looks like canvas weave under the paint
function buildCanvasGrain() {
  let grain = createGraphics(width, height);
  grain.pixelDensity(1);
  grain.loadPixels();
  for (let i = 0; i < grain.pixels.length; i += 4) {
    let px = (i / 4) % width, py = floor(i / 4 / width);
    let weave = ((px % 3 === 0) ? 18 : 0) + ((py % 3 === 0) ? 18 : 0);
    let v = 128 + random(-40, 40) + weave - 18;
    grain.pixels[i] = grain.pixels[i + 1] = grain.pixels[i + 2] = v;
    grain.pixels[i + 3] = 255;
  }
  grain.updatePixels();
  return grain;
}


// ---------------------------------------------------------------------
// HELPERS: regions and colour
// ---------------------------------------------------------------------
function classifyRegion(u, v, colour) {
  if (v < SKY_BOTTOM) return 'sky';
  if (v < TOWN_BOTTOM) return 'town';
  if (v < nearBankY(u)) {
    let golden = colour[0] > 150 && colour[1] > 130 && colour[2] < 120;
    return golden ? 'reflection' : 'water';
  }
  return 'grass';
}

function nearBankY(u) {
  for (let i = 0; i < NEAR_BANK_LINE.length - 1; i++) {
    let [x1, y1] = NEAR_BANK_LINE[i];
    let [x2, y2] = NEAR_BANK_LINE[i + 1];
    if (u >= x1 && u <= x2) return map(u, x1, x2, y1, y2);
  }
  return NEAR_BANK_LINE[NEAR_BANK_LINE.length - 1][1];
}

function isDetailArea(u, v) {
  return DETAIL_AREAS.some(a => u > a.x1 && u < a.x2 && v > a.y1 && v < a.y2);
}

function readPixel(img, x, y) {
  let i = (constrain(floor(y), 0, img.height - 1) * img.width + constrain(floor(x), 0, img.width - 1)) * 4;
  return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]];
}

function brightness3(c) {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
}

function rgbString(r, g, b) {
  return 'rgb(' + round(constrain(r, 0, 255)) + ',' + round(constrain(g, 0, 255)) + ',' + round(constrain(b, 0, 255)) + ')';
}

function lerpAngle(a, b, t) {
  return a + atan2(sin(b - a), cos(b - a)) * t;
}

