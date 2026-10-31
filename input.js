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
