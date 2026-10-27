let img;
let numSegments = 50;
let segments = [];
let drawSegments = true;

function preload() {
  img = loadImage("assets/starry-night.jpg");
}

function setup() {
  createCanvas(900, 600);

  img.resize(width, 0);
  resizeCanvas(img.width, img.height);

  let segmentWidth = width / numSegments;
  let segmentHeight = height / numSegments;

  for (let row = 0; row < numSegments; row++) {
    for (let col = 0; col < numSegments; col++) {
      let x = col * segmentWidth;
      let y = row * segmentHeight;

      let segmentColour = img.get(
        x + segmentWidth / 2,
        y + segmentHeight / 2
      );

      segments.push(
        new ImageSegment(
          x,
          y,
          segmentWidth,
          segmentHeight,
          segmentColour
        )
      );
    }
  }
}

function draw() {
  background(20, 30, 50);

  if (drawSegments) {
    for (let segment of segments) {
      let distance = dist(
        segment.x,
        segment.y,
        mouseX,
        mouseY
      );

      segment.scale = distance / 100;
      segment.draw();
    }
  } else {
    image(img, 0, 0);
  }
}

function keyPressed() {
  if (key === " ") {
    drawSegments = !drawSegments;
  }
}

class ImageSegment {
  constructor(x, y, segmentWidth, segmentHeight, segmentColour) {
    this.x = x;
    this.y = y;
    this.segmentWidth = segmentWidth;
    this.segmentHeight = segmentHeight;
    this.segmentColour = segmentColour;
    this.scale = 1;
  }

  draw() {
    noStroke();
    fill(this.segmentColour);

    rect(
      this.x,
      this.y,
      this.segmentWidth * this.scale,
      this.segmentHeight * this.scale
    );
  }
}