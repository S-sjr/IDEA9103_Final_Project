// Scene parameters, palettes and coordinates within the painting.
// Loaded by index.html before time.js and sketch.js.

// ==================== Timing and effect parameters ====================


const DURATION = 15000;            // Sunset-to-night transition: 15 seconds
const SUNSET_HOLD_DURATION = 5000; // Opening sunset hold: 5 seconds
const NIGHT_HOLD_DURATION = 210000; // 3 minutes 30 seconds

const CYCLE_DURATION =
  SUNSET_HOLD_DURATION + DURATION + NIGHT_HOLD_DURATION;
const CANVAS_WIDTH = 1024;
const HORIZON = 0.43;
const EFFECT_STRENGTH = 0.9;

// Simulated time: 18:00 → 24:00
// 21:00 corresponds to 7.5 seconds into the transition, after the opening hold.
const NIGHT_EFFECT_START_HOUR = 21;
const NIGHT_EFFECT_FULL_HOUR = 21.5;

// Oil-paint texture dimensions for the sun and moon
const OIL_ORB_SIZE = 224;
const OIL_ORB_RADIUS = 64;

// Sun: right → left
const SUN_START_X = 0.90;
const SUN_END_X = 0.30;

const SUN_START_Y = 0.18;
const SUN_CONTROL_Y = 0.10; // Controls the height of the arc
const SUN_END_Y = 0.46;

// The sun finishes setting during the first half of the transition.
const SUN_TRAVEL_END = 0.50;

// Fade out quickly as the sun approaches its setting point.
const SUN_FADE_START = 0.36;
const SUN_FADE_END = SUN_TRAVEL_END;

// Gradually move behind the clouds while setting.
const SUN_FRONT_START = 0.28;
const SUN_FRONT_END = 0.46;

// Moon: rise from near the sunset position towards the upper left.
const MOON_APPEAR_START = SUN_TRAVEL_END;
const MOON_START_X = SUN_END_X;
const MOON_END_X = 0.14;

const MOON_START_Y = 0.40;
const MOON_END_Y = 0.12;

// The RGB gradient fades out completely 13.5 seconds into the transition.
const GRADIENT_FADE_START = 0;
const GRADIENT_FADE_END = 0.90;

// Clouds gradually disperse.
const CLOUD_SKY_HEIGHT = 0.405;
const CLOUD_CLEAR_START = 0.30;
const CLOUD_CLEAR_END = 0.80;

const RGB_TIMES = [0, 0.5, 1];

// At each time point:
// [upper-sky colour, horizon colour, water colour]
// Each colour: [R, G, B, A]
const RGB_PALETTE = [
  [
    [112, 63, 131, 70],
    [255, 150, 60, 145],
    [231, 117, 60, 40]
  ],
  [
    [57, 40, 103, 105],
    [150, 80, 140, 120],
    [45, 33, 85, 90]
  ],
  [
    [2, 6, 24, 175],
    [10, 20, 60, 165],
    [1, 5, 20, 155]
  ]
];

// Cloud colours: sunset → dusk → night
const CLOUD_PALETTE = [
  [
    [217, 181, 192, 255],
    [255, 202, 156, 255]
  ],
  [
    [104, 107, 143, 255],
    [160, 121, 151, 255]
  ],
  [
    [48, 58, 86, 255],
    [70, 71, 103, 255]
  ]
];

// Coordinates are expressed as proportions of the source image width and height.
const STAR_POINTS = [
  [0.049, 0.183, 0.9],
  [0.114, 0.037, 0.65],
  [0.181, 0.115, 0.65],
  [0.258, 0.166, 1],
  [0.380, 0.120, 1],
  [0.475, 0.139, 0.85],
  [0.548, 0.166, 1],
  [0.621, 0.224, 0.9],
  [0.676, 0.123, 0.9],
  [0.688, 0.202, 0.9],
  [0.780, 0.132, 0.65],
  [0.852, 0.143, 0.7],
  [0.917, 0.200, 0.85],
  [0.976, 0.226, 0.65],
  [0.865, 0.301, 0.7],
  [0.660, 0.343, 0.6],
  [0.408, 0.347, 0.65],
  [0.394, 0.263, 0.6]
];

// Clouds also cover the smaller stars in the source image.
const CLOUD_STAR_POINTS = [
  ...STAR_POINTS,
  [0.374, 0.009],
  [0.542, 0.013],
  [0.689, 0.011],
  [0.940, 0.040],
  [0.859, 0.056],
  [0.640, 0.034],
  [0.735, 0.081],
  [0.892, 0.131],
  [0.942, 0.353],
  [0.327, 0.300],
  [0.255, 0.299],
  [0.340, 0.246]
];

// Sky boundary, excluding church spires and buildings
const CLOUD_SKYLINE = [
  [0, 0.355],
  [0.035, 0.340],
  [0.065, 0.350],
  [0.090, 0.370],
  [0.101, 0.365],
  [0.102, 0.345],
  [0.112, 0.321],
  [0.114, 0.300],
  [0.118, 0.321],
  [0.126, 0.344],
  [0.130, 0.395],
  [0.150, 0.394],
  [0.170, 0.380],
  [0.190, 0.400],
  [0.230, 0.395],
  [0.270, 0.390],
  [0.310, 0.404],
  [0.350, 0.395],
  [0.400, 0.402],
  [0.460, 0.412],
  [0.540, 0.416],
  [0.620, 0.429],
  [0.750, 0.434],
  [1, 0.437]
];

const LAMP_POINTS = [
  [0.012, 0.423],
  [0.027, 0.425],
  [0.071, 0.445],
  [0.085, 0.448],
  [0.113, 0.450],
  [0.171, 0.442],
  [0.276, 0.438],
  [0.375, 0.442],
  [0.451, 0.441],
  [0.563, 0.444],
  [0.635, 0.451],
  [0.662, 0.455],
  [0.687, 0.456],
  [0.886, 0.462],
  [0.931, 0.464],
  [0.947, 0.465]
];

// [horizontal position, reflection start, reflection length]
const REFLECTIONS = [
  [0.170, 0.51, 0.13],
  [0.280, 0.51, 0.19],
  [0.376, 0.51, 0.18],
  [0.460, 0.49, 0.17],
  [0.558, 0.48, 0.18],
  [0.576, 0.49, 0.17],
  [0.635, 0.50, 0.18],
  [0.665, 0.49, 0.18],
  [0.685, 0.50, 0.17],
  [0.893, 0.51, 0.15],
  [0.940, 0.52, 0.16],
  [0.990, 0.51, 0.16]
];
