# Starry Night Over the Rhône — Living Pigments

IDEA9103 Creative Coding Major Project — Group C  
University of Sydney, Semester 2 2026  
Due: Friday 6 November 2026, 4:00 pm.

Our p5.js reinterpretation of Vincent van Gogh's *Starry Night Over the Rhône* (1888) combines painted strokes, changing light, music and visitor interaction. The broken reflections and directional brushwork inform the visual design. Temporary mouse disturbances and the couple's brief appearance suggest a visitor passing through a landscape whose movement continues independently. This is our interpretation, rather than a claim about the artist's documented intentions.

## Inspiration and musical direction

We reinterpret the contrast between the painting's cool blue night and warm golden lights as a striking visual tension. Our intended emotional response is solitude: a broad, continuously moving landscape surrounds figures whose presence is temporary. This is the team's creative reading, not a claim about Van Gogh's documented intentions.

We chose the instrumental piano version of *Glimpse of Us* linked in the music credits to support this feeling. Its slow pacing and weighty notes give the scene a sense of loneliness, while the warm piano tone accompanies the strong contrast between cool and warm colours. Bass energy expands the river's movement; three separate midrange and treble bands illuminate interleaved star groups. Different response times let the light linger between musical accents without making every star flash in unison.

The original painting supplies the composition, palette and brush directions. Petros Vrellis' flowing-brush animation informed the idea of treating painted marks as moving material; the coastal-animation reference informed the layered water and grass motion. Links and asset credits are listed below.

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
| Press or hold the arrow keys | The couple fades in and walks slowly within the grass, with a gentle rotational walking sway. Moving towards the bottom increases its scale. |
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
| Build a seeded, layered painting from the source image | Broad marks establish the composition, followed by finer directional brushwork | [initializeNoiseRandomness](noise-randomness.js#L198), [BrushStroke](noise-randomness.js#L449), [displayNoiseRandomness](noise-randomness.js#L325) |
| Combine shared noise fields with random surges | Sky, water and grass move continuously, with variations rather than identical repeated motions | [updateNoiseFields](noise-randomness.js#L1249), [updateSurges](noise-randomness.js#L1277) |
| Animate river particles and light columns | Flowing strokes and shimmering reflections retain the painting's broken-water texture | [FlowParticle](noise-randomness.js#L986), [LightParticle](noise-randomness.js#L1034), [updateWaterTrail](noise-randomness.js#L934) |
| Give scene elements individual motion | Stars twinkle, cloud wisps drift, grass bends, and water glints and ripple rings appear | [TwinkleStar](noise-randomness.js#L594), [CloudWisp](noise-randomness.js#L1163), [GrassBlade](noise-randomness.js#L714), [updateAndDrawWaterLife](noise-randomness.js#L1136) |
| Batch strokes and limit rendering cost | Support a dense painted surface while reducing repeated drawing work | [buildStrokeBatches](noise-randomness.js#L1307), [checkPerformance](noise-randomness.js#L386) |

The source image supplies colour and direction. Selected boat and mast details are retained through [buildOriginalPatches](noise-randomness.js#L1459); the source image also serves as a loading-failure fallback in the shared sketch. The work therefore combines procedural marks with selected image details, rather than eliminating bitmap rendering entirely.

### Chenlei Shi (`shi1907194503-dot`) — time

Primary modules: [time.js](time.js) and [scene_data.js](scene_data.js), integrated through the shared [sketch.js](sketch.js).

| Functionality | Effect in the artwork | Traceable implementation |
|---|---|---|
| Define timing, palettes and measured positions | Keep the lighting progression and celestial elements aligned with the composition | [timing constants](scene_data.js#L7), [sceneProgress](sketch.js#L92) |
| Interpolate colour and fade the gradient | Warm sunset colour gradually gives way to the underlying night painting | [paletteAt](time.js#L15), [gradientVisibility](time.js#L50), [drawGradient](time.js#L76) |
| Build and move painted sun and moon textures | The sun sets behind the clouds and the moon rises towards the upper left | [buildOilOrb](time.js#L276), [drawSun](time.js#L426), [drawMoon](time.js#L468) |
| Change cloud coverage and night visibility | Clouds disperse while stars and reflected lights become more prominent | [drawClouds](time.js#L752), [nightEffectVisibility](time.js#L66), [drawStarGlow](time.js#L884), [drawLightsAndReflections](time.js#L918) |

The active loop calls `sceneProgress()`. The older `cycleProgress()` helper remains in the file but is not called by `draw()`; its return-to-sunset branch does not describe the current playback cycle.

### Tao Yan (`Tao105619`) — user input

Primary module: [input.js](input.js), with drawing hooks inside `noise-randomness.js` and lifecycle calls in `sketch.js`.

| Functionality | Effect in the artwork | Traceable implementation |
|---|---|---|
| Store and decay a bounded history of mouse movement | River marks follow a passing gesture and then settle back without replacing their natural motion | [updateRiverInput](input.js#L32), [getRiverInputOffset](input.js#L68); consumed by [FlowParticle](noise-randomness.js#L986) and [LightParticle](noise-randomness.js#L1034) |
| Apply local displacement to grass tips | Foreground grass follows the mouse direction with fixed roots | [updateGrassInput](input.js#L113), [getGrassInputOffset](input.js#L141); consumed by [GrassBlade](noise-randomness.js#L714) |
| Load and crop the separate couple sprite once | Preserve a clear foreground figure without repeatedly processing the full asset | [preloadCoupleInput](input.js#L184), [setupCoupleInput](input.js#L190) |
| Use elapsed time, boundary constraints and a smoothed sway | Arrow-key walking stays within the bank and eases into and out of its walking motion | [constrainCoupleToGrass](input.js#L219), [updateCoupleInput](input.js#L243) |
| Track arrow input, opacity and foot depth | The couple appears on interaction, fades after inactivity, and grows nearer the bottom | [activateCoupleInput](input.js#L238), [getCoupleDepthScale](input.js#L212), [drawCoupleInput](input.js#L293), [keyPressed](input.js#L310) |

Current tuning: walking rotation is at most +/-1 degree around a pivot 60% down the sprite; river radius 75 pixels; grass radius 90 pixels; walking speed 22.5 canvas pixels per second; maximum near scale 1.55 (55% larger). Position constraints reserve the largest footprint to avoid edge corrections caused solely by changing scale. The original `assets/couple.png` is not modified.

### Jiarong Sun (`ROoooonG`) — audio

Primary module: [audio.js](audio.js); the volume interface is defined in [index.html](index.html) and styled in [style.css](style.css).

| Functionality | Effect in the artwork | Traceable implementation |
|---|---|---|
| Load background music and handle browser audio unlocking | Music can accompany the scene after an accepted user gesture; visual initialization does not wait for the song | [initializeAudio](audio.js#L76), [unlockBackgroundAudio](audio.js#L68), [startBackgroundMusic](audio.js#L61) |
| Analyse bass energy and smooth its response | Stronger bass increases water movement; the multiplier ranges from the natural baseline of 1 to 4.6 | [normalizedBand](audio.js#L96), [smoothAudioEnergy](audio.js#L101), [updateAudio](audio.js#L107) |
| Analyse three separate star bands | Interleaved star groups brighten differently with musical detail instead of all pulsing identically | [AUDIO_SETTINGS](audio.js#L9), [updateAudio](audio.js#L107), [setStarMusicPulses](noise-randomness.js#L1583), [getStarMusicPulse](noise-randomness.js#L1589) |
| Provide a volume panel and bounded visual compensation | Listening volume is adjustable; quiet playback retains star detail, while muting lets the musical response decay | [initializeVolumeControl](audio.js#L34), [updateAudio](audio.js#L107) |

Two FFT analysers use 1024 bins. Water reads 60–250 Hz; stars use 500–1500, 1500–3000 and 3000–6000 Hz, with separate gains and attack/release times. Each star group uses its own gain (0.7, 2 or 6) and attack/release times (0.035/0.18, 0.09/0.32 or 0.16/0.48 seconds). The separate star analyser retains quiet details down to -120 dB; volume compensation is capped at 3 times. These are frequency-energy responses, not beat or note detection. Natural star twinkle continues without musical input, and the time module still controls when stars are visible.

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

- **Grass coverage:** the original foreground figures' image patch was removed and the area blended into the surrounding painted bank. [grassCoverAmount](noise-randomness.js#L1515) and [buildGrassBlades](noise-randomness.js#L766) support this coverage; the separate couple sprite provides the current interactive figures.
- **Input integration:** the current implementation uses fading movement histories for water and grass, then adds keyboard walking, smooth sway, inactivity fading and depth scaling. It replaces the earlier documented grid/space-bar concept.
- **Musical stars:** three frequency groups and separate response envelopes replace a single uniform musical brightness description. Gains remain configurable in `AUDIO_SETTINGS`.

The project includes techniques beyond basic mouse, loop and variable exercises: [buildDirectionField](noise-randomness.js#L1380) uses a structure tensor, [buildPalette](noise-randomness.js#L1428) uses colour clustering, and several renderers use the browser Canvas 2D API through `drawingContext`. The structure tensor estimates local image orientation so the marks follow the artwork. Colour clustering groups similar stroke colours to reduce drawing-state changes. Canvas 2D paths batch many marks into fewer draw calls. FFT band analysis separates musical details so the river and star groups can respond differently; attack/release smoothing avoids abrupt visual jumps. References accompany these techniques in the source and below.

## AI assistance and credits

The existing project acknowledgement credits **Claude (Anthropic, Opus 5.5)** with assisting Tianyi Bo on the noise/randomness architecture, layered repainting, region motion, structure-tensor direction and colour batching, including drafting portions of `noise-randomness.js` and its comments. That attribution is retained from the project records; the module also contains its own acknowledgement.

**OpenAI ChatGPT / Codex** assisted with the input module and its integration, grass coverage changes, couple movement and appearance, audio integration, debugging and documentation. Codex also assisted slow natural star twinkle, grouped musical brightness, low-volume sensitivity, couple fade-in/fade-out and rotational sway. Documentation assistance included English comments, source links and checking descriptions against the implementation. Earlier Codex assistance on the separate local `rhone-pigments` study is distinct from this repository. AI-assisted code should be reviewed and understood by the responsible members before presentation; the ownership table is not a claim that generated code was independently written.

### Artwork, visual and technical references

- Vincent van Gogh, *Starry Night Over the Rhône* (1888): source composition, palette and brushwork. Image downloaded from [NBFOX](https://www.nbfox.com/starry-night-over-the-rhone/) and stored in `assets/Starry_Night_Over_the_Rhone.jpeg`.
- [Petros Vrellis, Starry Night animation](https://artof01.com/vrellis/works/starry_night.html): conceptual reference for flowing brush directions; the existing project credits identify it as a visual/conceptual reference rather than a code source.
- [Painterly coastal animation](https://xhslink.cn/o/9D56KGBAxiA): existing visual reference for water layers and directional grass.
- [p5.js](https://p5js.org/), [noise](https://p5js.org/reference/p5/noise/), [randomSeed](https://p5js.org/reference/p5/randomSeed/), [noiseSeed](https://p5js.org/reference/p5/noiseSeed/), [p5.FFT](https://p5js.org/reference/p5.sound/p5.FFT/): library references. Bundled libraries are third-party code.
- [Seeded random generator reference](https://github.com/bryc/code/blob/master/jshash/PRNGs.md): algorithm background for the Mulberry32-style `oilRandom()` helper used to build repeatable paint textures.
- [CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D), [structure tensor](https://en.wikipedia.org/wiki/Structure_tensor), [k-means clustering](https://en.wikipedia.org/wiki/K-means_clustering): technical background retained from the original README.
- Music: *Glimpse of Us*, instrumental piano version used by the team, stored in `assets/Glimpse of Us.m4a`. Source supplied by the team: [Bilibili video BV19a411W7GA](https://www.bilibili.com/video/BV19a411W7GA/). The page could not be retrieved during the documentation check, so its uploader, performer and official-release status have not been independently verified.
- Figure asset: `assets/couple.png`. The team isolated the couple from the source painting in Adobe Photoshop and exported a transparent PNG. The source painting was downloaded from [NBFOX](https://www.nbfox.com/starry-night-over-the-rhone/). At runtime, the input module crops transparent padding and resizes the sprite in memory for interactive walking, rotation and fading; it does not modify the PNG file.

## Testing and remaining checks

Check the final experience in the intended browser, including audio unlocking, sustained frame rate, river/grass interaction and keyboard focus. Source inspection and syntax checks do not replace a full visual and audio test. The accessibility description matches the 230-second lighting cycle. The music loops independently and is not reset by the lighting loop. The supplied music source is linked in the asset credits; its uploader and recording attribution still need confirmation from the source page.
