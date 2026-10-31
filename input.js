/*
 * Tao Yan — 留不住的河光 / Fleeting Riverlight
 * AI assistance: OpenAI Codex helped draft this module and integration.
 * Classroom building blocks: variables, arithmetic, conditions, functions,
 * arrays, objects, loops, mouseX/mouseY, dist(), constrain().
 * New design: a short history of mouse movements creates local displacement
 * that fades over successive frames. This is not tutorial code or fluid physics.
 * The existing group sketch owns preload(), setup() and draw().
 */

let riverInputRadius = 75;       // Radius in canvas pixels
let riverInputLimit = 55;        // Maximum horizontal displacement
let riverInputReturn = 0.92;     // Smaller value means quicker recovery
let riverInputMarks = [];       // Fixed-size history: never grows indefinitely
let riverInputNext = 0;
let riverInputLastX = 0;
let riverInputLastY = 0;
let riverInputWasInside = false;

function setupRiverInput() {
  setupCoupleInput();
  setupGrassInput();
  riverInputMarks = [];
  for (let i = 0; i < 24; i++) {
    riverInputMarks.push({ x: 0, y: 0, moveX: 0, moveY: 0 });
  }
  riverInputNext = 0;
  riverInputWasInside = false;
}

// Called once per frame BEFORE the scene draws its particles.
function updateRiverInput() {
  updateCoupleInput();
  updateGrassInput();
  // Existing disturbances fade even after the mouse leaves the canvas.
  for (let mark of riverInputMarks) {
    mark.moveX *= riverInputReturn;
    mark.moveY *= riverInputReturn;
  }

  // Use the group's existing river boundaries, excluding the town and bank.
  let inside = mouseX >= 0 && mouseX <= width &&
    mouseY > TOWN_BOTTOM * height &&
    mouseY < nearBankY(mouseX / width) * height;

  if (inside && riverInputWasInside) {
    let movement = dist(mouseX, mouseY, riverInputLastX, riverInputLastY);

    // Ignore stationary input; reject very large jumps after leaving/re-entering.
    if (movement > 0.5 && movement < 160) {
      let mark = riverInputMarks[riverInputNext];
      mark.x = (mouseX + riverInputLastX) / 2;
      mark.y = (mouseY + riverInputLastY) / 2;
      mark.moveX = constrain((mouseX - riverInputLastX) * 1.4, -30, 30);
      mark.moveY = constrain((mouseY - riverInputLastY) * 0.6, -12, 12);

      riverInputNext++;
      if (riverInputNext >= riverInputMarks.length) riverInputNext = 0;
    }
  }

  riverInputLastX = mouseX;
  riverInputLastY = mouseY;
  riverInputWasInside = inside;
}

// Returns a temporary drawing offset. Does not overwrite natural particle motion.
function getRiverInputOffset(x, y) {
  let offsetX = 0;
  let offsetY = 0;

  for (let mark of riverInputMarks) {
    let distance = dist(x, y, mark.x, mark.y);
    if (distance < riverInputRadius) {
      let influence = 1 - distance / riverInputRadius;
      offsetX += mark.moveX * influence;
      offsetY += mark.moveY * influence;
    }
  }

  offsetX = constrain(offsetX, -riverInputLimit, riverInputLimit);
  offsetY = constrain(offsetY, -18, 18);

  // Keep displaced light within the river, including its sloping near bank.
  let displacedX = constrain(x + offsetX, 0, width);
  let displacedY = constrain(
    y + offsetY,
    (TOWN_BOTTOM + 0.003) * height,
    (nearBankY(displacedX / width) - 0.003) * height
  );

  return { x: displacedX - x, y: displacedY - y };
}

// Grass input: nearby tips follow mouse movement; roots stay fixed.
// Uses the same classroom building blocks as the river interaction.
let grassInputRadius = 90;
let grassInputMarks = [];
let grassInputNext = 0;
let grassInputLastX = 0;
let grassInputLastY = 0;
let grassInputWasInside = false;

function setupGrassInput() {
  grassInputMarks = [];
  for (let i = 0; i < 12; i++) {
    grassInputMarks.push({ x: 0, y: 0, moveX: 0, moveY: 0 });
  }
  grassInputNext = 0;
  grassInputWasInside = false;
}

function updateGrassInput() {
  for (let mark of grassInputMarks) {
    mark.moveX *= 0.86;
    mark.moveY *= 0.86;
  }

  // Include the tips slightly above the riverbank boundary.
  let inside = mouseX >= 0 && mouseX <= width &&
    mouseY >= nearBankY(mouseX / width) * height - 45 &&
    mouseY <= height;

  if (inside && grassInputWasInside) {
    let movement = dist(mouseX, mouseY, grassInputLastX, grassInputLastY);
    if (movement > 0.5 && movement < 160) {
      let mark = grassInputMarks[grassInputNext];
      mark.x = (mouseX + grassInputLastX) / 2;
      mark.y = (mouseY + grassInputLastY) / 2;
      mark.moveX = constrain((mouseX - grassInputLastX) * 2, -35, 35);
      mark.moveY = constrain((mouseY - grassInputLastY) * 0.7, -12, 12);
      grassInputNext++;
      if (grassInputNext >= grassInputMarks.length) grassInputNext = 0;
    }
  }
  grassInputLastX = mouseX;
  grassInputLastY = mouseY;
  grassInputWasInside = inside;
}

function getGrassInputOffset(rootX, rootY, bladeHeight) {
  let offsetX = 0;
  let offsetY = 0;
  for (let mark of grassInputMarks) {
    // Test the middle of the blade instead of only its root.
    let distance = dist(rootX, rootY - bladeHeight / 2, mark.x, mark.y);
    if (distance < grassInputRadius) {
      let influence = 1 - distance / grassInputRadius;
      offsetX += mark.moveX * influence;
      offsetY += mark.moveY * influence;
    }
  }
  return {
    x: constrain(offsetX, -bladeHeight * 0.9, bladeHeight * 0.9),
    y: constrain(offsetY, -bladeHeight * 0.25, bladeHeight * 0.25)
  };
}

// Couple: time-based walking, smooth sway, and inactivity fade.
let coupleImage;
let coupleSprite;
let coupleImageFailed = false;
let coupleX = 0;
let coupleY = 0;
let coupleHeight = 0;
let coupleWidth = 0;
let coupleNearScale = 1.55; // Up to 15% larger near the bottom
let coupleWalkSpeed = 22.5; // Canvas pixels per second
let coupleSway = 0;
let coupleWalkPhase = 0;
let coupleSwayAmount = 0;
let coupleOpacity = 0;
let coupleLastArrowTime = -1;
let couplePreviousTime = 0;
let coupleIdleDelay = 10000;
let coupleFadeDuration = 2000;

function preloadCoupleInput() {
  coupleImage = loadImage('assets/couple.png', undefined, function () {
    coupleImageFailed = true;
  });
}

function setupCoupleInput() {
  coupleHeight = height * 0.16;
  coupleWidth = coupleHeight * 2313 / 3065;
  coupleX = width * 0.77;
  coupleY = height * 0.95;
  coupleSway = 0;
  coupleWalkPhase = 0;
  coupleSwayAmount = 0;
  coupleOpacity = 0;
  coupleLastArrowTime = -1;
  couplePreviousTime = millis();
  // Crop transparent padding and resize ONCE in memory, not every frame.
  // This avoids tinting/scaling a 5407 x 4191 image during walking/fading.
  // The original assets/couple.png file is never modified.
  if (!coupleImageFailed && coupleImage && coupleImage.width) {
    coupleSprite = coupleImage.get(1547, 563, 2313, 3065);
    coupleSprite.resize(Math.ceil(coupleWidth * 2), 0);
  }
  constrainCoupleToGrass();
}

// Use absolute foot depth so sideways walking does not change the scale.
function getCoupleDepthScale() {
  let farY = height * 0.78;
  let nearY = height - 8;
  let depth = constrain((coupleY - farY) / (nearY - farY), 0, 1);
  return 1 + depth * (coupleNearScale - 1);
}

function constrainCoupleToGrass() {
  // Reserve the largest footprint, avoiding edge jumps as the figure grows.
  let halfWidth = coupleWidth * coupleNearScale / 2 + 4;
  coupleX = constrain(coupleX, halfWidth, width - halfWidth);
  let bankY = nearBankY(coupleX / width) * height;
  let leftBank = nearBankY((coupleX - halfWidth) / width) * height;
  let rightBank = nearBankY((coupleX + halfWidth) / width) * height;
  if (leftBank > bankY) bankY = leftBank;
  if (rightBank > bankY) bankY = rightBank;
  coupleY = constrain(coupleY, bankY + 12, height - 8);
}

function coupleKeyboardAvailable() {
  let tag = document.activeElement.tagName;
  return focused && tag !== 'INPUT' && tag !== 'TEXTAREA' &&
    tag !== 'SELECT' && tag !== 'BUTTON' &&
    !document.activeElement.isContentEditable;
}

function activateCoupleInput() {
  coupleLastArrowTime = millis();
  coupleOpacity = 255;
}

function updateCoupleInput() {
  let now = millis();
  // Clamp long stalls so returning to the tab cannot teleport the couple.
  let seconds = constrain((now - couplePreviousTime) / 1000, 0, 0.1);
  couplePreviousTime = now;
  let moveX = 0;
  let moveY = 0;
  if (coupleKeyboardAvailable()) {
    let left = keyIsDown(LEFT_ARROW);
    let right = keyIsDown(RIGHT_ARROW);
    let up = keyIsDown(UP_ARROW);
    let down = keyIsDown(DOWN_ARROW);
    if (left || right || up || down) activateCoupleInput();
    if (left) moveX--;
    if (right) moveX++;
    if (up) moveY--;
    if (down) moveY++;
  }
  if (moveX !== 0 && moveY !== 0) {
    moveX *= 0.7071;
    moveY *= 0.7071;
  }
  let oldX = coupleX;
  let oldY = coupleY;
  coupleX += moveX * coupleWalkSpeed * seconds;
  coupleY += moveY * coupleWalkSpeed * seconds;
  constrainCoupleToGrass();

  let moving = dist(oldX, oldY, coupleX, coupleY) > 0.001;
  // Smooth start/stop envelope; no sharp reversal at the sway endpoints.
  if (moving) {
    coupleSwayAmount = constrain(coupleSwayAmount + seconds * 3, 0, 1);
  } else {
    coupleSwayAmount = constrain(coupleSwayAmount - seconds * 4, 0, 1);
  }
  if (moving || coupleSwayAmount > 0) coupleWalkPhase += seconds * 5;
  coupleSway = Math.sin(coupleWalkPhase) * 1.2 * coupleSwayAmount;

  if (coupleLastArrowTime < 0) {
    coupleOpacity = 0;
  } else {
    let fadeTime = now - coupleLastArrowTime - coupleIdleDelay;
    coupleOpacity = 255 * (1 - constrain(fadeTime / coupleFadeDuration, 0, 1));
  }
}

function drawCoupleInput() {
  if (coupleImageFailed || !coupleSprite || coupleOpacity <= 0) return;
  push();
  imageMode(CORNER);
  tint(255, coupleOpacity);
  let depthScale = getCoupleDepthScale();
  let drawWidth = coupleWidth * depthScale;
  let drawHeight = coupleHeight * depthScale;
  // Keep feet anchored: enlargement grows upward, not below the grass.
  image(coupleSprite, coupleX - drawWidth / 2 + coupleSway,
    coupleY - drawHeight, drawWidth, drawHeight);
  pop();
}

function keyPressed() {
  if (coupleKeyboardAvailable() &&
      (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW ||
       keyCode === UP_ARROW || keyCode === DOWN_ARROW)) {
    // Capture even a brief tap occurring between rendered frames.
    activateCoupleInput();
    return false;
  }
}
