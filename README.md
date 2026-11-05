# Starry Night Over the Rhône — Living Pigments

IDEA9103 Creative Coding Major Project — Group C  
University of Sydney, Semester 2 2026  
Due: Friday 6 November 2026, 4:00 pm.

Our p5.js reinterpretation of Vincent van Gogh's *Starry Night Over the Rhône* (1888) combines painted strokes, changing light, music and visitor interaction. The broken reflections and directional brushwork inform the visual design. Temporary mouse disturbances and the couple's brief appearance suggest a visitor passing through a landscape whose movement continues independently. This is our interpretation, rather than a claim about the artist's documented intentions.

## Running the project

Serve this directory over HTTP using VS Code Live Server, or run:

```sh
python3 -m http.server 8000
```

Visit `http://localhost:8000`. No build step or npm installation is needed: p5.js and p5.sound are bundled in `libraries/`. Keep the asset paths and script order in [index.html](index.html) intact. Audio playback requires browser support for the supplied M4A file; a click or key press may be needed to unlock playback.

## Controls and current behaviour

| Action | Visible or audible effect |
|---|---|
| Move the mouse across the river | Nearby water strokes and golden reflections shift with the movement, then gradually recover. The input region spans the canvas width between the town and the sloping near bank. |
| Move the mouse across the foreground grass | Nearby blade tips bend in the movement direction while roots remain fixed. The current influence radius is 90 canvas pixels. |
| Press or hold the arrow keys | The couple fades in and walks slowly within the grass, with a gentle walking sway. Moving towards the bottom increases its scale. |
| Release all arrow keys | The couple stops; after 3 seconds without arrow input, it fades out over 2 seconds. Its initial fade-in takes 1.5 seconds. These are the current code values. |
| Click the speaker button | Open the volume slider. Zero mutes the music; click outside or press Escape to close the panel. |

Keyboard walking is disabled while a form control or editable element has focus. Mouse interaction is movement-driven; there is no active space-bar image toggle or click-to-create-ripple control.

The painting reveals its strokes over approximately 3 seconds. Separately, the lighting cycle lasts **230 seconds**: 5 seconds of sunset, a 15-second sunset-to-night transition, then 210 seconds of night before a direct reset. Natural motion and musical responses continue during the night hold. CSS fits the canvas to the available display space; it does not rebuild the scene on every window resize.

## Four members: functions, effects and source evidence

The ownership labels below record the group's mechanic assignments. Function and class links show where the described behaviour is implemented; they do not establish sole authorship of shared or AI-assisted code.

### Tianyi Bo (`RussellB-OvO`) — noise and randomness

Primary module: [noise-randomness.js](noise-randomness.js).

| Functionality | Effect in the artwork | Traceable implementation |
|---|---|---|
| Build a seeded, layered painting from the source image | Broad marks establish the composition, followed by finer directional brushwork | [initializeNoiseRandomness](noise-randomness.js#L194), [BrushStroke](noise-randomness.js#L446), [displayNoiseRandomness](noise-randomness.js#L322) |
| Combine shared noise fields with random surges | Sky, water and grass move continuously, with variations rather than identical repeated motions | [updateNoiseFields](noise-randomness.js#L1246), [updateSurges](noise-randomness.js#L1274) |
| Animate river particles and light columns | Flowing strokes and shimmering reflections retain the painting's broken-water texture | [FlowParticle](noise-randomness.js#L983), [LightParticle](noise-randomness.js#L1031), [updateWaterTrail](noise-randomness.js#L931) |
| Give scene elements individual motion | Stars twinkle, cloud wisps drift, grass bends, and water glints and ripple rings appear | [TwinkleStar](noise-randomness.js#L591), [CloudWisp](noise-randomness.js#L1160), [GrassBlade](noise-randomness.js#L711), [updateAndDrawWaterLife](noise-randomness.js#L1133) |
| Batch strokes and limit rendering cost | Support a dense painted surface while reducing repeated drawing work | [buildStrokeBatches](noise-randomness.js#L1304), [checkPerformance](noise-randomness.js#L383) |

The source image supplies colour and direction. Selected boat and mast details are retained through [buildOriginalPatches](noise-randomness.js#L1454); the source image also serves as a loading-failure fallback in the shared sketch. The work therefore combines procedural marks with selected image details, rather than eliminating bitmap rendering entirely.

### Chenlei Shi (`shi1907194503-dot`) — time

Primary modules: [time.js](time.js) and [scene_data.js](scene_data.js), integrated through the shared [sketch.js](sketch.js).

| Functionality | Effect in the artwork | Traceable implementation |
|---|---|---|
| Define timing, palettes and measured positions | Keep the lighting progression and celestial elements aligned with the composition | [timing constants](scene_data.js#L7), [sceneProgress](sketch.js#L90) |
| Interpolate colour and fade the gradient | Warm sunset colour gradually gives way to the underlying night painting | [paletteAt](time.js#L15), [gradientVisibility](time.js#L50), [drawGradient](time.js#L76) |
| Build and move painted sun and moon textures | The sun sets behind the clouds and the moon rises towards the upper left | [buildOilOrb](time.js#L275), [drawSun](time.js#L425), [drawMoon](time.js#L467) |
| Change cloud coverage and night visibility | Clouds disperse while stars and reflected lights become more prominent | [drawClouds](time.js#L751), [nightEffectVisibility](time.js#L66), [drawStarGlow](time.js#L881), [drawLightsAndReflections](time.js#L915) |

The active loop calls `sceneProgress()`. The older `cycleProgress()` helper remains in the file but is not called by `draw()`; its return-to-sunset branch does not describe the current playback cycle.

### Tao Yan (`Tao105619`) — user input

Primary module: [input.js](input.js), with drawing hooks inside `noise-randomness.js` and lifecycle calls in `sketch.js`.

| Functionality | Effect in the artwork | Traceable implementation |
|---|---|---|
| Store and decay a bounded history of mouse movement | River marks follow a passing gesture and then settle back without replacing their natural motion | [updateRiverInput](input.js#L32), [getRiverInputOffset](input.js#L68); consumed by [FlowParticle](noise-randomness.js#L983) and [LightParticle](noise-randomness.js#L1031) |
| Apply local displacement to grass tips | Foreground grass follows the mouse direction with fixed roots | [updateGrassInput](input.js#L113), [getGrassInputOffset](input.js#L141); consumed by [GrassBlade](noise-randomness.js#L711) |
| Load and crop the separate couple sprite once | Preserve a clear foreground figure without repeatedly processing the full asset | [preloadCoupleInput](input.js#L181), [setupCoupleInput](input.js#L187) |
| Use elapsed time, boundary constraints and a smoothed sway | Arrow-key walking stays within the bank and eases into and out of its walking motion | [constrainCoupleToGrass](input.js#L216), [updateCoupleInput](input.js#L240) |
| Track arrow input, opacity and foot depth | The couple appears on interaction, fades after inactivity, and grows nearer the bottom | [activateCoupleInput](input.js#L235), [getCoupleDepthScale](input.js#L209), [drawCoupleInput](input.js#L290), [keyPressed](input.js#L307) |

Current tuning: river radius 75 pixels; grass radius 90 pixels; walking speed 22.5 canvas pixels per second; maximum near scale 1.55 (55% larger). Position constraints reserve the largest footprint to avoid edge corrections caused solely by changing scale. The original `assets/couple.png` is not modified.

### Jiarong Sun (`ROoooonG`) — audio

Primary module: [audio.js](audio.js); the volume interface is defined in [index.html](index.html) and styled in [style.css](style.css).

| Functionality | Effect in the artwork | Traceable implementation |
|---|---|---|
| Load background music and handle browser audio unlocking | Music can accompany the scene after an accepted user gesture; visual initialization does not wait for the song | [initializeAudio](audio.js#L71), [unlockBackgroundAudio](audio.js#L63), [startBackgroundMusic](audio.js#L56) |
| Analyse bass energy and smooth its response | Stronger bass increases water movement; the multiplier ranges from the natural baseline of 1 to 4.6 | [normalizedBand](audio.js#L91), [smoothAudioEnergy](audio.js#L96), [updateAudio](audio.js#L102) |
| Analyse three separate star bands | Interleaved star groups brighten differently with musical detail instead of all pulsing identically | [AUDIO_SETTINGS](audio.js#L4), [updateAudio](audio.js#L102), [setStarMusicPulses](noise-randomness.js#L1578), [getStarMusicPulse](noise-randomness.js#L1584) |
| Provide a volume panel and bounded visual compensation | Listening volume is adjustable; quiet playback retains star detail, while muting lets the musical response decay | [initializeVolumeControl](audio.js#L29), [updateAudio](audio.js#L102) |

Two FFT analysers use 1024 bins. Water reads 60–250 Hz; stars use 500–1500, 1500–3000 and 3000–6000 Hz, with separate gains and attack/release times. These are frequency-energy responses, not beat or note detection. Natural star twinkle continues without musical input, and the time module still controls when stars are visible.

## How the four mechanics connect

[sketch.js](sketch.js) owns the single p5 lifecycle. `preload()` loads painting and couple assets; `setup()` initializes the textures and modules. Each `draw()` updates audio and input before calculating scene time and rendering.

| Producer | Consumer | Combined result |
|---|---|---|
| Time: `nightEffectVisibility(t)` | Noise: `setStarVisibility()` | Natural and musical stars follow the same sunset-to-night progression. |
| Audio: `updateAudio()` | Noise: `setWaterRippleScale()` | Musical energy strengthens the existing noise-driven river motion. |
| Audio: `setStarMusicPulses()` | Noise stars and time's `drawStarGlow()` | Painted stars and their overlaid glows share the same musical group response. |
| Input: `getRiverInputOffset()` / `getGrassInputOffset()` | Noise particle and grass classes | Local mouse gestures are added to the underlying natural animation. |
| Input: `drawCoupleInput()` | Final layer of `renderScene()` | The interactive couple remains visible above the painted scene and lighting overlays. |

`disturbWater()` and `setStarTwinkleBoost()` remain available in the noise module, but the current input/audio modules do not call them. Random ripple rings still belong to the noise animation.

## Development iterations and implementation scope

- **Grass coverage:** the original foreground figures' image patch was removed and the area blended into the surrounding painted bank. [grassCoverAmount](noise-randomness.js#L1510) and [buildGrassBlades](noise-randomness.js#L763) support this coverage; the separate couple sprite provides the current interactive figures.
- **Input integration:** the current implementation uses fading movement histories for water and grass, then adds keyboard walking, smooth sway, inactivity fading and depth scaling. It replaces the earlier documented grid/space-bar concept.
- **Musical stars:** three frequency groups and separate response envelopes replace a single uniform musical brightness description. Gains remain configurable in `AUDIO_SETTINGS`.

The project includes techniques beyond basic mouse, loop and variable exercises: [buildDirectionField](noise-randomness.js#L1376) uses a structure tensor, [buildPalette](noise-randomness.js#L1423) uses colour clustering, and several renderers use the browser Canvas 2D API through `drawingContext`. This README does not claim that every technique was covered in class. Course coverage should be checked against the actual teaching materials.

## AI assistance and credits

The existing project acknowledgement credits **Claude (Anthropic, Opus 5.5)** with assisting Tianyi Bo on the noise/randomness architecture, layered repainting, region motion, structure-tensor direction and colour batching, including drafting portions of `noise-randomness.js` and its comments. That attribution is retained from the project records; the module also contains its own acknowledgement.

**OpenAI ChatGPT / Codex** assisted with the input module and its integration, grass coverage changes, couple movement and appearance, audio integration, debugging and documentation. This documentation pass translated remaining Chinese comments, consolidated repeated README material and linked descriptions to the current implementation. Earlier Codex assistance on the separate local `rhone-pigments` study is distinct from this repository. AI-assisted code should be reviewed and understood by the responsible members before presentation; the ownership table is not a claim that generated code was independently written.

### Artwork, visual and technical references

- Vincent van Gogh, *Starry Night Over the Rhône* (1888): source composition, palette and brushwork. Stored in `assets/Starry_Night_Over_the_Rhone.jpeg`.
- [Petros Vrellis, Starry Night animation](https://artof01.com/vrellis/works/starry_night.html): conceptual reference for flowing brush directions; the existing project credits identify it as a visual/conceptual reference rather than a code source.
- [Painterly coastal animation](https://xhslink.cn/o/9D56KGBAxiA): existing visual reference for water layers and directional grass.
- [p5.js](https://p5js.org/), [noise](https://p5js.org/reference/p5/noise/), [randomSeed](https://p5js.org/reference/p5/randomSeed/), [noiseSeed](https://p5js.org/reference/p5/noiseSeed/), [p5.FFT](https://p5js.org/reference/p5.sound/p5.FFT/): library references. Bundled libraries are third-party code.
- [CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D), [structure tensor](https://en.wikipedia.org/wiki/Structure_tensor), [k-means clustering](https://en.wikipedia.org/wiki/K-means_clustering): technical background retained from the original README.
- Music asset: `assets/Glimpse of Us.m4a`. Recording attribution, source and permitted use still need to be completed in the submission credits.
- Figure asset: `assets/couple.png`, cropped in memory by the input module. Its asset provenance should be included in the final submission credits.

## Remaining checks

Check the final experience in the intended browser, including audio unlocking, sustained frame rate, river/grass interaction and keyboard focus. Source inspection and syntax checks do not replace a full visual and audio test. The accessibility text in `sketch.js` still describes a fifteen-second loop; its runtime string was left unchanged during this comment-and-README-only edit and should be updated to reflect the 230-second cycle.
