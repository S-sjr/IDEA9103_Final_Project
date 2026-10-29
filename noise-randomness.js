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
//     · Water   – calm and rough moments alternate (noise + random surges);
//                 flow particles keep repainting the river along a noise
//                 current (after Petros Vrellis' Starry Night animation);
//                 golden particles shimmer inside each column of light with
//                 random strength; the whole surface wavers; sparkles and
//                 ripple rings appear at random places, sizes and times
//     · Grass   – long soft blades on the near bank: big noise waves roll
//                 through the whole patch, each blade sways and curls with
//                 its own noise, gusts come at random moments with random
//                 strength, and every blade has random flexibility
//
// RANDOMNESS (chosen once, when the painting is built)
//   randomSeed() + noiseSeed() → one seed number reproduces the whole work
//   random() → stroke positions, length, slight colour variation,
//              painting order, personal noise offsets and speeds
// PERLIN NOISE (read every frame with small time steps → smooth motion)
//   noise(x, y, t)      shared fields: neighbouring strokes move together
//   noise(offset + t)   personal flutter / shimmer
//   (plus random "surges": at random moments the water or the wind gets
//    a random extra push that slowly dies down)
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
// HOOKS FOR THE OTHER MECHANICS (bottom of file)
//   Audio (Jiarong): setWaterRippleScale(n)
//   Input (Tao):     disturbWater(x, y)   (starts a ripple ring)
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
  skyFlow: 1,
  waterFloat: 1,
  grassSway: 1
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
let grassBlades = [];
let grassBatches = [];
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
let waveRows;               // water: sideways offset for every 2px row
let windColumns;            // one wind value per column
let windGust = 0;           // overall wind strength right now (noise + surges)
let waterSwell = 0;         // overall water movement right now (noise + surges)
let waterSurge = 0;         // random surge of waves, fades away
let windSurge = 0;          // random gust of wind, fades away

// 1D Perlin curve sampled once; personal motion reads it with an offset
// (same values as calling noise() each time, far cheaper for 30k strokes)
const NOISE_TABLE_SIZE = 4096;
let noiseTable;

let externalInfluence = {
  waterRippleScale: 1
};


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

  // Grass blades on the near bank
  buildGrassBlades(colourSources.detail);

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
  waterTrail = createGraphics(width, height);
  waterTrail.pixelDensity(1);
  waterColourSource = colourSources.detail;
  buildWaterParticles();
  canvasGrain = buildCanvasGrain();

  skyField = new Float32Array(FIELD_COLUMNS * FIELD_ROWS * 3);
  waveRows = new Float32Array(ceil(height / WAVE_ROW) + 1);
  waterGlints = [];
  waterRipples = [];
  windColumns = new Float32Array(FIELD_COLUMNS);
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

  // 2b. Particles keep repainting the river, then the river wavers
  //     as one surface (wave displacement)
  updateWaterTrail(progress);
  drawWaterSurface(ctx);

  // 3. Moving strokes
  for (let s of movingStrokes) s.update();
  let revealed = constrain(map(progress, 0.25, 1, 0, 1), 0, 1);
  ctx.save();
  ctx.lineCap = 'round';
  drawSkyStrokes(ctx, revealed);
  drawBatches(ctx, revealed);
  ctx.restore();

  // Random glints and ripple rings on the water
  if (revealed > 0.5) updateAndDrawWaterLife(ctx);

  // The couple and boats, from the original painting (under the grass)
  ctx.save();
  ctx.globalAlpha = constrain(map(progress, 0.6, 1, 0, 1), 0, 1);
  ctx.drawImage(patchLayer.elt, 0, 0, width, height);
  ctx.restore();

  // Grass blades sway in front of the bank
  if (revealed > 0) drawGrassBlades(ctx, revealed);

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
                    this.region === 'water' || this.region === 'reflection';

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

    } else if (this.region === 'grass') {
      // root fixed, tip swings: shared wind + personal flutter
      let wind = windColumns[columnIndex(u)];
      angle += (wind * 0.8 + personal * 0.4) * this.swayAmount * motionSettings.grassSway;
      this.setEnds(x, y, x + cos(angle) * length, y + sin(angle) * length);
      return;
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
// CLASS 3: GrassBlade — a long, thin, curving blade with a fixed root
// ---------------------------------------------------------------------
// Wind has two layers (idea from a p5.js reed-field piece on Xiaohongshu,
// "芦海扁舟"): a LOW-frequency noise makes whole patches of grass rise and
// fall together like waves, a MID-frequency noise adds each blade's own
// small movement. Group waves first, individual movement second.
const GRASS_SEGMENTS = 10;

class GrassBlade {
  constructor(x, y, colour) {
    this.x = x;
    this.y = y;
    let depth = map(y / height, 0.76, 1, 0, 1, true);       // nearer = longer
    this.height = random(20, 42) * (0.65 + depth * 0.8) * brushScale;
    this.lean = random(0.05, 0.45);                          // rests leaning right
    this.flexibility = random(0.5, 1.8);                     // random sway strength
    this.softness = random(0.8, 1.8);                        // how much it curls
    this.noiseOffset = random(NOISE_TABLE_SIZE);
    this.appearAt = random(0.3, 1);
    this.points = new Float32Array((GRASS_SEGMENTS + 1) * 2);
    // painting colour pulled toward the bright yellow-greens of the bank
    let target = random([[196, 206, 120], [170, 196, 112], [214, 210, 138], [150, 186, 150]]);
    this.colour = [
      constrain(lerp(colour[0], target[0], 0.55) + random(-12, 12), 0, 255),
      constrain(lerp(colour[1], target[1], 0.55) + random(-12, 12), 0, 255),
      constrain(lerp(colour[2], target[2], 0.55) + random(-12, 12), 0, 255)
    ];
  }

  update() {
    let u = this.x / width, v = this.y / height;
    // low frequency: big rolling wave across the whole bank
    let wave = (noise(u * 1.8 - flowTime * 0.55, v * 3, 500) - 0.5) * 2;
    // mid frequency: this blade's own movement
    let own = noiseTableAt(this.noiseOffset + flowTime * 260) - 0.5;
    let bend = (wave * 1.3 * windGust + own * 0.7) * this.flexibility * motionSettings.grassSway;

    let px = this.x, py = this.y;
    this.points[0] = px; this.points[1] = py;
    let step = this.height / GRASS_SEGMENTS;
    for (let k = 1; k <= GRASS_SEGMENTS; k++) {
      let t = k / GRASS_SEGMENTS;
      // each segment also gets its own noise, so the blade curls softly
      // (an S-shape that keeps changing) instead of bending stiffly
      let curl = (noiseTableAt(this.noiseOffset + k * 28 + flowTime * 300) - 0.5) * 1.3 * this.softness;
      // bending grows toward the tip, root stays still
      // the top droops a little under its own weight, like soft reeds
      let droop = this.lean * t * t * 0.8;
      let angle = -HALF_PI + this.lean * t + droop + bend * pow(t, 1.4) + curl * t;
      px += cos(angle) * step;
      py += sin(angle) * step;
      this.points[k * 2] = px; this.points[k * 2 + 1] = py;
    }
  }
}

function buildGrassBlades(colourSource) {
  grassBlades = [];
  let count = floor(4200 * (width * height) / (1024 * 794));
  let tries = 0;
  while (grassBlades.length < count && tries < count * 8) {
    tries++;
    let u = random(), v = random(0.76, 1.02);
    if (v < nearBankY(u) + 0.01) continue;                 // only on the bank
    let x = u * width, y = v * height;
    let c = readPixel(colourSource.img, x / colourSource.blur, min(y, height - 1) / colourSource.blur);
    // leave the couple visible: no blades rooted right in front of them
    // (blades around grow over the window's soft edge)
    let couple = ORIGINAL_PATCHES[0];
    // (only around their upper bodies — the grass may cover their legs)
    let du = (u - couple.cx) / (couple.rx * 0.6), dv = (v - (couple.cy - 0.02)) / (couple.ry * 0.55);
    if (du * du + dv * dv < 1) continue;
    grassBlades.push(new GrassBlade(x, y, c));
  }
  grassBlades.sort((a, b) => a.y - b.y);                   // far first

  // Batch by colour so thousands of blades draw in a few calls
  let grassPalette = buildPalette(grassBlades.map(b => b.colour), 14);
  let groups = new Map();
  for (let b of grassBlades) {
    let k = nearestColour(grassPalette, ...b.colour);
    let thick = b.height > 33 * brushScale ? 1 : 0;
    let key = k + '_' + thick;
    if (!groups.has(key)) {
      let c = grassPalette[k];
      groups.set(key, {
        style: rgbString(c[0] + thick * 14, c[1] + thick * 14, c[2] + thick * 8),
        lineWidth: (thick ? 2.8 : 2.0) * brushScale,
        blades: []
      });
    }
    groups.get(key).blades.push(b);
  }
  grassBatches = [...groups.values()];
}

function drawGrassBlades(ctx, revealed) {
  for (let b of grassBlades) b.update();
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.6;
  for (let batch of grassBatches) {
    ctx.strokeStyle = batch.style;
    ctx.lineWidth = batch.lineWidth;
    ctx.beginPath();
    for (let b of batch.blades) {
      if (b.appearAt > revealed) continue;
      let p = b.points;
      ctx.moveTo(p[0], p[1]);
      // smooth curve through the segment points
      for (let k = 1; k < GRASS_SEGMENTS; k++) {
        let mx = (p[k * 2] + p[k * 2 + 2]) / 2;
        let my = (p[k * 2 + 1] + p[k * 2 + 3]) / 2;
        ctx.quadraticCurveTo(p[k * 2], p[k * 2 + 1], mx, my);
      }
      ctx.lineTo(p[GRASS_SEGMENTS * 2], p[GRASS_SEGMENTS * 2 + 1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}


// ---------------------------------------------------------------------
// WATER: one moving surface + random life on it
// ---------------------------------------------------------------------
// The painted water (in staticLayer) is cut into thin horizontal rows and
// each row is drawn shifted sideways. The shift comes from two layers of
// Perlin noise (slow big swell + quicker small ripples), so the whole
// river wavers smoothly like real water, and more strongly near the bank.
// (Row-displacement is a common way to fake water refraction — it is the
//  same idea as a "wave distortion" filter in image editors.)
const WAVE_ROW = 2;            // px per row
let waterGlints = [];
let waterRipples = [];
let waterTrail;              // p5.Graphics: the river, constantly repainted by particles
let flowParticles = [];      // water particles carrying the painting's colours
let lightParticles = [];     // golden particles held inside the columns of light
let lightColumns = [];       // where the columns of light are
let waterColourSource;       // colours read by the particles

function updateWaveRows() {
  let swell = waterSwell;
  let strength = motionSettings.waterFloat * externalInfluence.waterRippleScale;
  let top = TOWN_BOTTOM * height;
  for (let r = 0; r < waveRows.length; r++) {
    let y = r * WAVE_ROW;
    let depth = constrain((y - top) / (height * 0.38), 0, 1);   // 0 far → 1 near
    let big = noise(y * 0.022, flowTime * 0.55, 50) - 0.5;      // slow swell
    let small = noise(y * 0.11, flowTime * 1.6, 90) - 0.5;      // quick ripples
    waveRows[r] = (big * 2 * 16 + small * 2 * 5) * (0.3 + depth) * swell * strength * brushScale;
  }
}

function waveOffsetAt(y) {
  return waveRows[constrain(floor(y / WAVE_ROW), 0, waveRows.length - 1)];
}

function drawWaterSurface(ctx) {
  let top = floor((TOWN_BOTTOM - 0.005) * height);
  let bottom = ceil(0.87 * height);
  ctx.save();
  // clip to the river so the bank does not move
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(width, top);
  for (let i = NEAR_BANK_LINE.length - 1; i >= 0; i--) {
    ctx.lineTo(NEAR_BANK_LINE[i][0] * width, NEAR_BANK_LINE[i][1] * height);
  }
  ctx.closePath();
  ctx.clip();
  let source = waterTrail.elt;
  for (let y = top; y < bottom; y += WAVE_ROW) {
    let dx = waveOffsetAt(y);
    ctx.drawImage(source, 0, y, width, WAVE_ROW + 1, dx, y, width, WAVE_ROW + 1);
  }
  ctx.restore();
}

// ---- Flow particles (technique inspired by Petros Vrellis, "Starry Night
// interactive animation", 2012 — https://artof01.com/vrellis/works/starry_night.html:
// particles follow the painting's flow and leave fading paint trails, so
// the picture is continuously re-drawn while you watch).
//
// Every frame the trail layer is gently faded back toward the painted
// river (so trails never pile up), then each particle paints a short
// segment from where it was to where it is now.

function buildWaterParticles() {
  // Columns of light: group the golden water pixels by column
  lightColumns = [];
  let columnCount = 90;
  for (let c = 0; c < columnCount; c++) {
    let x = (c + 0.5) / columnCount * width;
    let golden = [];
    for (let y = TOWN_BOTTOM * height; y < nearBankY(x / width) * height; y += 4) {
      let col = readPixel(waterColourSource.img, x / waterColourSource.blur, y / waterColourSource.blur);
      if (col[0] > 150 && col[1] > 130 && col[2] < 120) golden.push(y);
    }
    if (golden.length > 6) {
      lightColumns.push({
        x: x,
        top: min(golden),
        bottom: max(golden),
        halfWidth: width / columnCount * 0.9,
        strength: random(0.4, 1.8),          // random wriggle per column
        offset: random(1000)
      });
    }
  }

  flowParticles = [];
  let flowCount = floor(1400 * (width * height) / (1024 * 794));
  for (let i = 0; i < flowCount; i++) flowParticles.push(new FlowParticle());
  lightParticles = [];
  if (lightColumns.length > 0) {
    let lightCount = floor(700 * (width * height) / (1024 * 794));
    for (let i = 0; i < lightCount; i++) lightParticles.push(new LightParticle());
  }
}

function updateWaterTrail(progress) {
  let tctx = waterTrail.drawingContext;
  if (progress < 1) {
    // during the intro the river simply follows the painting
    tctx.globalAlpha = 1;
    tctx.drawImage(staticLayer.elt, 0, 0);
    return;
  }
  // fade a little back toward the painted river
  tctx.globalAlpha = 0.045;
  tctx.drawImage(staticLayer.elt, 0, 0);

  // Each particle moves and adds its segment to a "bucket" (same colour,
  // transparency level and width); every bucket is then drawn with one
  // ctx.stroke() — far faster than drawing 2,000 lines one by one.
  particleBuckets.clear();
  for (let p of flowParticles) p.step();
  for (let p of lightParticles) p.step();

  tctx.save();
  tctx.lineCap = 'round';
  for (let bucket of particleBuckets.values()) {
    tctx.globalAlpha = bucket.alpha;
    tctx.strokeStyle = bucket.style;
    tctx.lineWidth = bucket.width;
    tctx.beginPath();
    let seg = bucket.segments;
    for (let i = 0; i < seg.length; i += 4) {
      tctx.moveTo(seg[i], seg[i + 1]);
      tctx.lineTo(seg[i + 2], seg[i + 3]);
    }
    tctx.stroke();
  }
  tctx.restore();
}

let particleBuckets = new Map();
const ALPHA_LEVELS = 4;

function addSegment(styleKey, style, alpha, lineWidth, x1, y1, x2, y2) {
  let a = round(constrain(alpha, 0, 1) * ALPHA_LEVELS);
  if (a === 0) return;
  let w = lineWidth > 3 * brushScale ? 1 : 0;
  let key = styleKey + '|' + a + '|' + w;
  let bucket = particleBuckets.get(key);
  if (!bucket) {
    bucket = { style, alpha: a / ALPHA_LEVELS, width: (w ? 3.8 : 2.4) * brushScale, segments: [] };
    particleBuckets.set(key, bucket);
  }
  bucket.segments.push(x1, y1, x2, y2);
}

class FlowParticle {
  constructor() { this.respawn(); }

  respawn() {
    let u = random();
    this.x = u * width;
    this.y = random(TOWN_BOTTOM + 0.005, nearBankY(u) - 0.005) * height;
    this.speed = random(0.5, 1.6) * brushScale;      // random speed
    this.life = floor(random(40, 160));              // random life (frames)
    this.age = 0;
    this.size = random(2.2, 4.2) * brushScale;
    this.alpha = random(0.25, 0.55);
    this.colourIndex = -1;
  }

  step() {
    let u = this.x / width, v = this.y / height;
    // flow direction: mostly along the river, bending with Perlin noise
    let bend = (noise(u * 3.5, v * 9, flowTime * 0.4) - 0.5) * 1.1;
    let swell = 0.4 + waterSwell * 0.8;
    let vx = cos(bend) * this.speed * swell * motionSettings.waterFloat * externalInfluence.waterRippleScale;
    let vy = sin(bend) * this.speed * 0.35;
    let nx = this.x + vx, ny = this.y + vy;

    // pick up the colour under the particle (every few frames)
    if (this.colourIndex < 0 || this.age % 6 === 0) {
      let c = readPixel(waterColourSource.img, this.x / waterColourSource.blur, this.y / waterColourSource.blur);
      this.colourIndex = nearestColour(palette, c[0] + 6, c[1] + 6, c[2] + 8);
    }
    let fade = sin(constrain(this.age / this.life, 0, 1) * PI);   // soft start and end
    addSegment('w' + this.colourIndex, paletteStyles[this.colourIndex],
               this.alpha * fade, this.size, this.x, this.y, nx, ny);

    this.x = nx; this.y = ny;
    this.age++;
    let outside = this.x > width || this.x < 0 || this.y / height > nearBankY(this.x / width) || this.y / height < TOWN_BOTTOM;
    if (this.age > this.life || outside) this.respawn();
  }
}

const LIGHT_COLOURS = ['rgb(246,200,92)', 'rgb(240,214,120)', 'rgb(222,170,70)'];

class LightParticle {
  constructor() { this.respawn(); }

  respawn() {
    this.column = random(lightColumns);
    this.x = this.column.x + random(-1, 1) * this.column.halfWidth;
    this.y = random(this.column.top, this.column.bottom);
    this.life = floor(random(15, 60));
    this.age = 0;
    this.size = random(1.6, 3.2) * brushScale;
    this.brightness = random(0.25, 0.7);            // random flicker strength
    this.colourIndex = floor(random(LIGHT_COLOURS.length));
  }

  step() {
    let col = this.column;
    // wriggle: noise that changes down the column and over time
    let wriggle = noise(this.y * 0.05, flowTime * 1.8, col.offset) - 0.5;
    // spring: pulled back toward the centre of its column
    let target = col.x + wriggle * 2 * col.halfWidth * 1.6 * col.strength * (0.4 + waterSwell);
    let nx = lerp(this.x, target, 0.25) + random(-0.4, 0.4);
    let ny = this.y + random(-0.3, 0.3);

    let fade = sin(constrain(this.age / this.life, 0, 1) * PI);
    // short horizontal dab, like light broken by ripples
    let half = random(2, 6) * brushScale;
    addSegment('L' + this.colourIndex, LIGHT_COLOURS[this.colourIndex],
               this.brightness * fade, this.size, nx - half, ny, nx + half, ny);

    this.x = nx; this.y = ny;
    this.age++;
    if (this.age > this.life) this.respawn();
  }
}

// A short bright sparkle on the water: random place, size and life
class WaterGlint {
  constructor() {
    // most glints appear inside a column of light, some anywhere on water
    if (lightColumns.length > 0 && random() < 0.75) {
      let c = random(lightColumns);
      this.x = c.x + random(-1, 1) * c.halfWidth;
      this.y = random(c.top, c.bottom);
    } else {
      let u = random();
      this.x = u * width;
      this.y = random(TOWN_BOTTOM + 0.02, nearBankY(u) - 0.02) * height;
    }
    this.length = random(4, 14) * brushScale;
    this.life = random(0.4, 1.8);               // seconds
    this.age = 0;
    this.warm = random() < 0.7;                  // golden or moonlight-white
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    let t = this.age / this.life;
    let a = sin(t * PI);                         // fade in, then out
    let x = this.x + waveOffsetAt(this.y);
    ctx.globalAlpha = 0.9 * a;
    ctx.strokeStyle = this.warm ? 'rgb(255,226,140)' : 'rgb(230,240,255)';
    ctx.lineWidth = 2.2 * brushScale;
    line2d(ctx, x - this.length / 2, this.y, x + this.length / 2, this.y);
    ctx.globalAlpha = 0.25 * a;
    ctx.lineWidth = 6 * brushScale;
    line2d(ctx, x - this.length * 0.3, this.y, x + this.length * 0.3, this.y);
  }
}

// An expanding ring on the water: random place, size, speed
class WaterRipple {
  constructor(x, y, strong) {
    let u = random();
    this.x = (x === undefined) ? u * width : x;
    this.y = (y === undefined) ? random(TOWN_BOTTOM + 0.05, nearBankY(u) - 0.03) * height : y;
    let depth = constrain((this.y / height - TOWN_BOTTOM) / 0.38, 0, 1);
    this.maxRadius = random(18, 55) * (0.5 + depth) * brushScale * (strong ? 1.6 : 1);
    this.life = random(1.6, 3.2);
    this.age = 0;
    this.flatten = random(0.22, 0.32);           // seen at a low angle
  }
  update(dt) { this.age += dt; return this.age < this.life; }
  draw(ctx) {
    let t = this.age / this.life;
    let ease = 1 - pow(1 - t, 2);
    let a = (1 - t) * 0.45;
    for (let k = 0; k < 2; k++) {               // two rings, one behind the other
      let r = this.maxRadius * ease * (1 - k * 0.35);
      if (r <= 1) continue;
      ctx.globalAlpha = a * (1 - k * 0.4);
      ctx.strokeStyle = 'rgb(205,225,245)';
      ctx.lineWidth = (1.6 - k * 0.5) * brushScale;
      ctx.beginPath();
      ctx.ellipse(this.x + waveOffsetAt(this.y), this.y, r, r * this.flatten, 0, 0, TWO_PI);
      ctx.stroke();
    }
  }
}

function updateAndDrawWaterLife(ctx) {
  let dt = min(deltaTime / 1000, 0.1);
  // random spawning: how many appear each moment is itself random
  let glintRate = 10 * (0.3 + waterSwell);            // per second, on average
  if (random() < glintRate * dt) waterGlints.push(new WaterGlint());
  if (random() < glintRate * dt * 0.6) waterGlints.push(new WaterGlint());
  if (random() < (0.5 + waterSwell * 0.6) * dt) waterRipples.push(new WaterRipple());

  waterGlints = waterGlints.filter(g => g.update(dt));
  waterRipples = waterRipples.filter(r => r.update(dt));

  ctx.save();
  ctx.lineCap = 'round';
  for (let r of waterRipples) r.draw(ctx);
  ctx.globalCompositeOperation = 'screen';
  for (let g of waterGlints) g.draw(ctx);
  ctx.restore();
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
  // Gusts: the overall wind strength itself is Perlin noise, so the
  // grass sometimes barely moves and sometimes bends hard
  updateSurges();
  // noise curve made more contrasting (pow), plus random surges on top
  let calmToRough = pow(noise(flowTime * 0.3, 1200), 2) * 2.2;
  waterSwell = 0.12 + calmToRough + waterSurge;
  windGust = 0.25 + pow(noise(flowTime * 0.35, 900), 1.5) * 2.2 + windSurge;
  updateWaveRows();
  for (let c = 0; c < FIELD_COLUMNS; c++) {
    // gusts travel across the bank from left to right
    windColumns[c] = noise(c * 0.08 - flowTime * 0.8, 300) - 0.5;
  }
}

// RANDOM SURGES: at random moments (random() each frame) a surge of
// random size starts and then slowly dies down. Together with the noise
// curve this gives "big, small, big…" with no fixed rhythm.
function updateSurges() {
  let dt = min(deltaTime / 1000, 0.1);
  if (random() < 0.12 * dt) waterSurge += random(0.6, 1.6);   // ~every 8 s
  if (random() < 0.15 * dt) windSurge += random(0.6, 1.8);    // ~every 7 s
  waterSurge *= 0.985;
  windSurge *= 0.98;
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


// ---------------------------------------------------------------------
// INTEGRATION HOOKS — for sketch.js and the other mechanics
// ---------------------------------------------------------------------

// Audio (Jiarong): bass → bigger water ripples, e.g. map(bass, 0, 255, 1, 3)
function setWaterRippleScale(scale) {
  externalInfluence.waterRippleScale = max(0, scale);
}

// Input (Tao): start a strong ripple ring on the water, e.g. on mouse
// click: if (mouseY > height * 0.5) disturbWater(mouseX, mouseY);
function disturbWater(x, y) {
  if (waterRipples.length < 40) waterRipples.push(new WaterRipple(x, y, true));
}
