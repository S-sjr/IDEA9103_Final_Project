// 日落到深夜的绘制效果与油画纹理工具。
// setup() 和 draw() 统一放在 sketch.js，避免 p5 生命周期冲突。

// ==================== RGB 渐变与时间 ====================

function mixRGBA(from, to, t) {
  return [
    lerp(from[0], to[0], t),
    lerp(from[1], to[1], t),
    lerp(from[2], to[2], t),
    lerp(from[3], to[3], t)
  ];
}

function paletteAt(palette, t) {
  let index = 0;

  while (
    index < RGB_TIMES.length - 2 &&
    t > RGB_TIMES[index + 1]
  ) {
    index++;
  }

  const amount = constrain(
    (t - RGB_TIMES[index]) /
    (RGB_TIMES[index + 1] - RGB_TIMES[index]),
    0,
    1
  );

  return palette[index].map((rgb, i) =>
    mixRGBA(rgb, palette[index + 1][i], amount)
  );
}

function colorsAt(t) {
  return paletteAt(RGB_PALETTE, t);
}

function rgbaCSS([r, g, b, a]) {
  return `rgba(${r},${g},${b},${a / 255})`;
}

function phase(t, start, end) {
  const u = constrain((t - start) / (end - start), 0, 1);
  return u * u * (3 - 2 * u);
}

function gradientVisibility(t) {
  return 1 - phase(
    t,
    GRADIENT_FADE_START,
    GRADIENT_FADE_END
  );
}

function cloudVisibility(t) {
  return 1 - phase(
    t,
    CLOUD_CLEAR_START,
    CLOUD_CLEAR_END
  );
}

function nightEffectVisibility(t) {
  const hour = 18 + constrain(t, 0, 1) * 6;

  return phase(
    hour,
    NIGHT_EFFECT_START_HOUR,
    NIGHT_EFFECT_FULL_HOUR
  );
}

function drawGradient(t, strength = 1) {
  const opacity = strength * gradientVisibility(t);
  if (opacity <= 0) return;

  const [top, horizon, bottom] = colorsAt(t);

  const ctx = drawingContext;
  ctx.save();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = opacity;

  const gradient = ctx.createLinearGradient(
    0, 0, 0, height
  );

  gradient.addColorStop(0, rgbaCSS(top));
  gradient.addColorStop(HORIZON, rgbaCSS(horizon));
  gradient.addColorStop(1, rgbaCSS(bottom));

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

// ==================== 油画笔触工具 ====================

// 固定随机种子，纹理不会逐帧改变
function oilRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6D2B79F5;

    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);

    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function paintCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function oilRGB(rgb, offset = 0) {
  const channels = rgb.slice(0, 3).map(v =>
    Math.round(constrain(v + offset, 0, 255))
  );

  return `rgb(${channels.join(',')})`;
}

// 厚涂短笔触：色块、暗边、亮色颜料脊与刷毛
function oilBrush(
  ctx,
  x,
  y,
  length,
  thickness,
  angle,
  rgb,
  opacity = 1,
  bend = 0,
  relief = 1
) {
  const l = length;
  const w = thickness;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha *= opacity;

  const alpha = ctx.globalAlpha;

  ctx.fillStyle = oilRGB(rgb);
  ctx.beginPath();

  ctx.moveTo(-l * 0.50, -w * 0.16);

  ctx.quadraticCurveTo(
    -l * 0.12,
    bend - w * 0.60,
    l * 0.36,
    -w * 0.32
  );

  ctx.lineTo(l * 0.50, -w * 0.12);
  ctx.lineTo(l * 0.43, w * 0.02);
  ctx.lineTo(l * 0.49, w * 0.16);
  ctx.lineTo(l * 0.34, w * 0.34);

  ctx.quadraticCurveTo(
    -l * 0.10,
    bend + w * 0.48,
    -l * 0.47,
    w * 0.21
  );

  ctx.closePath();
  ctx.fill();
  ctx.lineCap = 'round';

  const ridge = (
    offset,
    colorOffset,
    a,
    lineWidth
  ) => {
    ctx.globalAlpha = alpha * a * relief;
    ctx.strokeStyle = oilRGB(rgb, colorOffset);
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(-l * 0.37, offset);

    ctx.quadraticCurveTo(
      -l * 0.02,
      bend + offset,
      l * 0.34,
      offset * 0.75
    );

    ctx.stroke();
  };

  ridge(
    w * 0.27,
    -31,
    0.48,
    Math.max(0.55, w * 0.13)
  );

  ridge(
    -w * 0.21,
    37,
    0.65,
    Math.max(0.60, w * 0.15)
  );

  ridge(
    w * 0.03,
    13,
    0.42,
    Math.max(0.40, w * 0.07)
  );

  ctx.restore();
}

function oilGrain(ctx, w, h, seed, amount = 5) {
  const random = oilRandom(seed);
  const pixels = ctx.getImageData(0, 0, w, h);

  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = (random() - 0.5) * amount;

    for (let c = 0; c < 3; c++) {
      pixels.data[i + c] += grain;
    }
  }

  ctx.putImageData(pixels, 0, 0);
}

// 不规则圆形边缘
function oilOrbOutline(ctx, center, radius) {
  ctx.beginPath();

  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2;

    const r = radius * (
      1 +
      0.025 * Math.sin(a * 5 + 0.5) +
      0.018 * Math.sin(a * 11)
    );

    const x = center + Math.cos(a) * r;
    const y = center + Math.sin(a) * r;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
}

// ==================== 油画太阳与月亮 ====================

function buildOilOrb(kind) {
  const canvas = paintCanvas(
    OIL_ORB_SIZE,
    OIL_ORB_SIZE
  );

  const ctx = canvas.getContext('2d');
  const center = OIL_ORB_SIZE / 2;
  const r = OIL_ORB_RADIUS;
  const sun = kind === 'sun';
  const random = oilRandom(sun ? 814 : 1461);

  const palette = sun
    ? [
        [211, 114, 35],
        [239, 157, 47],
        [251, 192, 79],
        [255, 221, 128],
        [255, 240, 178]
      ]
    : [
        [140, 159, 148],
        [179, 191, 164],
        [215, 222, 184],
        [238, 238, 199],
        [252, 246, 214]
      ];

  // 断续弧形笔触组成光晕
  for (let i = 0; i < 160; i++) {
    const a = random() * Math.PI * 2;
    const distance = r + 4 + random() * 33;
    const color =
      palette[Math.floor(random() * 3) + 1];

    oilBrush(
      ctx,
      center + Math.cos(a) * distance,
      center + Math.sin(a) * distance,
      10 + random() * 22,
      2 + random() * 5,
      a + Math.PI / 2 + (random() - 0.5) * 0.35,
      color,
      (sun ? 0.22 : 0.15) *
        (1 - (distance - r) / 48),
      (random() - 0.5) * 3
    );
  }

  ctx.save();

  oilOrbOutline(ctx, center, r);
  ctx.fillStyle = oilRGB(palette[2]);
  ctx.fill();
  ctx.clip();

  for (
    let y = center - r - 8;
    y < center + r + 8;
    y += 6
  ) {
    for (
      let x = center - r - 12;
      x < center + r + 12;
      x += 9 + random() * 5
    ) {
      const px = x + (random() - 0.5) * 8;
      const py = y + (random() - 0.5) * 5;

      const nx = (px - center) / r;
      const ny = (py - center) / r;
      const distance = Math.hypot(nx, ny);

      if (distance > 1.25) continue;

      let index = Math.floor(
        2.3 +
        (1 - distance) * 1.7 +
        (random() - 0.5) * 1.7
      );

      if (!sun) {
        const shadow = Math.exp(
          -Math.pow((nx - 0.28) / 0.42, 2) -
          Math.pow((ny - 0.20) / 0.55, 2)
        );

        index -= Math.round(shadow * 1.8);
      }

      index = constrain(
        index,
        0,
        palette.length - 1
      );

      const color = palette[index].map(
        v => v + (random() - 0.5) * 10
      );

      const angle = sun
        ? Math.atan2(ny, nx) + Math.PI / 2
        : -0.2 + nx * 0.6;

      oilBrush(
        ctx,
        px,
        py,
        14 + random() * 24,
        5 + random() * 7,
        angle + (random() - 0.5) * 0.35,
        color,
        0.80 + random() * 0.20,
        (random() - 0.5) * 5
      );
    }
  }

  ctx.restore();

  oilGrain(
    ctx,
    canvas.width,
    canvas.height,
    sun ? 556 : 557,
    6
  );

  return canvas;
}

function drawOilOrb(sprite, x, y, radius, opacity) {
  const size =
    OIL_ORB_SIZE * radius / OIL_ORB_RADIUS;

  const ctx = drawingContext;
  ctx.save();
  ctx.globalAlpha *= opacity;

  ctx.drawImage(
    sprite,
    x - size / 2,
    y - size / 2,
    size,
    size
  );

  ctx.restore();
}

function drawSun(t, layerOpacity = 1) {
  const travel = phase(t, 0, SUN_TRAVEL_END);

  const opacity =
    (1 - phase(t, SUN_FADE_START, SUN_FADE_END)) *
    EFFECT_STRENGTH *
    layerOpacity;

  if (opacity <= 0) return;

  // 水平位置：从右侧向左侧移动
  const x = width * lerp(
    SUN_START_X,
    SUN_END_X,
    travel
  );

  // 垂直位置：使用二次曲线形成弧形轨迹
  const remaining = 1 - travel;

  const y = height * (
    remaining * remaining * SUN_START_Y +
    2 * remaining * travel * SUN_CONTROL_Y +
    travel * travel * SUN_END_Y
  );

  const radius = width * 0.027;
  const ctx = drawingContext;

  ctx.save();

  // 将太阳限制在天空内，落下后由地平线遮挡
  ctx.beginPath();
  ctx.rect(0, 0, width, height * HORIZON);
  ctx.clip();

  // 使用原有的油画太阳纹理
  drawOilOrb(oilSun, x, y, radius, opacity);

  ctx.restore();
}

function drawMoon(t) {
  const rise = phase(t, MOON_APPEAR_START, 1);

  const opacity =
    phase(t, MOON_APPEAR_START, 0.88) *
    EFFECT_STRENGTH;

  if (opacity <= 0) return;

  // 水平位置：向左侧移动
  const x = width * lerp(
    MOON_START_X,
    MOON_END_X,
    rise
  );

  // 垂直位置：从地平线附近升到上空
  const y = height * lerp(
    MOON_START_Y,
    MOON_END_Y,
    rise
  );

  const radius = width * 0.018;

  // 使用原有的油画月亮纹理
  drawOilOrb(oilMoon, x, y, radius, opacity);
}


// ==================== 油画云层 ====================

function cloudNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  const fx = x - ix;
  const fy = y - iy;

  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const hash = (a, b) => {
    const n = Math.sin(
      a * 127.1 + b * 311.7 + 42
    ) * 43758.5453;

    return n - Math.floor(n);
  };

  return lerp(
    lerp(hash(ix, iy), hash(ix + 1, iy), sx),
    lerp(
      hash(ix, iy + 1),
      hash(ix + 1, iy + 1),
      sx
    ),
    sy
  );
}

function buildCloudLayers() {
  const w = 512;

  const h = Math.ceil(
    w * height / width * CLOUD_SKY_HEIGHT
  );

  const makeCanvas = () => paintCanvas(w, h);

  cloudMask = makeCanvas();
  cloudShade = makeCanvas();
  cloudTint = makeCanvas();

  const maskCtx = cloudMask.getContext('2d');
  const shadeCtx = cloudShade.getContext('2d');

  const mask = maskCtx.createImageData(w, h);
  const shade = shadeCtx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const ny = y / h * CLOUD_SKY_HEIGHT;

    for (let x = 0; x < w; x++) {
      const nx = x / w;

      const broad = cloudNoise(
        nx * 3 + 7,
        ny * 10 + 13
      );

      const detail = cloudNoise(
        nx * 16 + 90,
        ny * 45 + 40
      );

      const band = Math.max(
        Math.exp(
          -Math.pow(
            (
              ny - 0.085 -
              0.025 * Math.sin(nx * 9 + 0.5)
            ) / 0.090,
            2
          )
        ),
        Math.exp(
          -Math.pow(
            (
              ny - 0.210 -
              0.020 * Math.sin(nx * 7 + 1.5)
            ) / 0.080,
            2
          )
        ),
        Math.exp(
          -Math.pow(
            (
              ny - 0.335 -
              0.012 * Math.sin(nx * 11)
            ) / 0.060,
            2
          )
        )
      );

      let coverage = phase(
        broad * 0.55 +
        detail * 0.10 +
        band * 0.35,
        0.24,
        0.55
      );

      // 星点位置使用不透明云核
      for (const [sx, sy] of CLOUD_STAR_POINTS) {
        const d = Math.hypot(
          (nx - sx) / 0.090,
          (ny - sy) / 0.050
        );

        if (d < 1.40) {
          coverage = Math.max(
            coverage,
            1 - phase(d, 0.70, 1.40)
          );
        }
      }

      coverage *= 1 - phase(
        ny,
        0.36,
        CLOUD_SKY_HEIGHT
      );

      const i = (y * w + x) * 4;

      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
      mask.data[i + 3] =
        Math.round(coverage * 255);

      const brightness = Math.round(
        255 * (
          0.62 +
          broad * 0.28 +
          detail * 0.10
        )
      );

      shade.data[i] = brightness;
      shade.data[i + 1] = brightness;
      shade.data[i + 2] = brightness;
      shade.data[i + 3] = 255;
    }
  }

  maskCtx.putImageData(mask, 0, 0);
  shadeCtx.putImageData(shade, 0, 0);

  buildOilCloudFrames();
}

function buildOilCloudFrames() {
  const w = Math.min(1024, width);

  const h = Math.ceil(
    w * height / width * CLOUD_SKY_HEIGHT
  );

  const random = oilRandom(297);
  const strokes = [];

  for (let y = -8; y < h + 10; y += 6.5) {
    for (
      let x = -16;
      x < w + 20;
      x += 12 + random() * 8
    ) {
      const px = x + (random() - 0.5) * 10;

      const py =
        y +
        Math.sin(px / w * 9 + y * 0.025) * 4 +
        (random() - 0.5) * 4;

      strokes.push({
        x: px,
        y: py,
        length: 14 + random() * 24,
        thickness: 3 + random() * 5,

        angle:
          -0.08 +
          0.22 * Math.sin(px / w * 8 + py / h * 3) +
          (random() - 0.5) * 0.18,

        bend: (random() - 0.5) * 5,
        tone: 0.75 + random() * 0.27,
        pigment: random(),
        alpha: 0.70 + random() * 0.28
      });
    }
  }

  cloudPaintFrames = CLOUD_PALETTE.map(
    ([top, bottom]) => {
      const canvas = paintCanvas(w, h);
      const ctx = canvas.getContext('2d');

      const gradient = ctx.createLinearGradient(
        0, 0, 0, h
      );

      gradient.addColorStop(0, rgbaCSS(top));
      gradient.addColorStop(1, rgbaCSS(bottom));

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(cloudShade, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';

      for (const stroke of strokes) {
        const base = mixRGBA(
          top,
          bottom,
          constrain(stroke.y / h, 0, 1)
        );

        const pigment = stroke.pigment < 0.3
          ? [-9, -5, 13]
          : stroke.pigment > 0.8
            ? [11, 4, -12]
            : [0, 0, 0];

        const color = base.slice(0, 3).map(
          (v, i) => v * stroke.tone + pigment[i]
        );

        oilBrush(
          ctx,
          stroke.x,
          stroke.y,
          stroke.length,
          stroke.thickness,
          stroke.angle,
          color,
          stroke.alpha,
          stroke.bend,
          0.58
        );
      }

      oilGrain(ctx, w, h, 502, 5);
      return canvas;
    }
  );

  cloudTint = paintCanvas(w, h);
}

function drawClouds(t) {
  const opacity = cloudVisibility(t);
  if (opacity <= 0) return;

  let index = 0;

  while (
    index < RGB_TIMES.length - 2 &&
    t > RGB_TIMES[index + 1]
  ) {
    index++;
  }

  const amount = constrain(
    (t - RGB_TIMES[index]) /
    (RGB_TIMES[index + 1] - RGB_TIMES[index]),
    0,
    1
  );

  const buffer = cloudTint.getContext('2d');

  buffer.save();

  buffer.clearRect(
    0,
    0,
    cloudTint.width,
    cloudTint.height
  );

  // 混合两个时刻的云纹理，保持云核不透明
  buffer.globalAlpha = 1 - amount;
  buffer.drawImage(cloudPaintFrames[index], 0, 0);

  buffer.globalCompositeOperation = 'lighter';
  buffer.globalAlpha = amount;

  buffer.drawImage(
    cloudPaintFrames[index + 1],
    0,
    0
  );

  buffer.globalAlpha = 1;
  buffer.globalCompositeOperation = 'destination-in';

  buffer.drawImage(
    cloudMask,
    0,
    0,
    cloudTint.width,
    cloudTint.height
  );

  buffer.restore();

  const ctx = drawingContext;
  ctx.save();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = opacity;

  // 云层只画在天空内
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);

  for (
    let i = CLOUD_SKYLINE.length - 1;
    i >= 0;
    i--
  ) {
    ctx.lineTo(
      CLOUD_SKYLINE[i][0] * width,
      CLOUD_SKYLINE[i][1] * height
    );
  }

  ctx.closePath();
  ctx.clip();

  const drift =
    Math.sin(effectSeconds * 0.12) * width * 0.003;

  ctx.drawImage(
    cloudTint,
    drift,
    0,
    width,
    height * CLOUD_SKY_HEIGHT
  );

  ctx.restore();
}

// ==================== 星光与灯光倒影 ====================

function glow(x, y, radius, rgb, opacity) {
  if (opacity <= 0 || radius <= 0) return;

  const ctx = drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const gradient = ctx.createRadialGradient(
    x, y, 0,
    x, y, radius
  );

  const rgba = a =>
    `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  gradient.addColorStop(0, rgba(opacity));
  gradient.addColorStop(0.25, rgba(opacity * 0.48));
  gradient.addColorStop(0.65, rgba(opacity * 0.10));
  gradient.addColorStop(1, rgba(0));

  ctx.fillStyle = gradient;

  ctx.fillRect(
    x - radius,
    y - radius,
    radius * 2,
    radius * 2
  );

  ctx.restore();
}

function drawStarGlow(t) {
  const amount =
    nightEffectVisibility(t) * EFFECT_STRENGTH;

  if (amount <= 0) return;

  STAR_POINTS.forEach(([sx, sy, size], i) => {
    const twinkle =
      0.83 +
      0.17 * Math.sin(
        effectSeconds * 1.7 + i * 2.4
      );

    const x = sx * width;
    const y = sy * height;

    glow(
      x,
      y,
      width * 0.030 * size,
      [255, 234, 161],
      amount * twinkle * 0.55
    );

    glow(
      x,
      y,
      width * 0.004 * size,
      [255, 249, 211],
      amount * twinkle * 0.65
    );
  });
}

function drawLightsAndReflections(t) {
  const amount =
    nightEffectVisibility(t) * EFFECT_STRENGTH;

  if (amount <= 0) return;

  LAMP_POINTS.forEach(([x, y], i) => {
    const pulse =
      0.94 +
      0.06 * Math.sin(
        effectSeconds * 1.2 + i
      );

    glow(
      x * width,
      y * height,
      width * 0.013,
      [255, 199, 87],
      amount * pulse * 0.55
    );

    glow(
      x * width,
      y * height,
      width * 0.003,
      [255, 241, 175],
      amount * pulse * 0.65
    );
  });

  const ctx = drawingContext;
  ctx.save();

  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';

  REFLECTIONS.forEach(([x, startY, length], i) => {
    for (let j = 0; j < 16; j++) {
      const u = j / 15;

      const wave = Math.sin(
        effectSeconds * 1.5 +
        j * 0.8 +
        i * 0.7
      );

      const center =
        x * width + wave * width * 0.002;

      const y =
        (startY + u * length) * height;

      const halfWidth =
        width *
        (0.0015 + 0.005 * u) *
        (0.85 + 0.15 * wave);

      const opacity =
        amount *
        (0.11 + 0.11 * (0.5 + 0.5 * wave)) *
        (1 - 0.5 * u);

      ctx.strokeStyle =
        `rgba(255,220,132,${opacity})`;

      ctx.lineWidth =
        (0.7 + u) * width / 1024;

      ctx.beginPath();
      ctx.moveTo(center - halfWidth, y);
      ctx.lineTo(center + halfWidth, y);
      ctx.stroke();
    }
  });

  ctx.restore();
}
