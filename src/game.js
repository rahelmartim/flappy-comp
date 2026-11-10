import {
  WIDTH,
  HEIGHT,
  SKY_COLOR,
  BIRD,
  WORLD,
  PIPES,
  GAME_OVER_INPUT_DELAY,
  BEST_SCORE_KEY,
} from "./config.js";

const State = Object.freeze({
  MENU: "menu",
  PLAYING: "playing",
  DYING: "dying",
  OVER: "over",
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (min, max) => min + Math.random() * (max - min);
const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

function readBestScore() {
  const value = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function circleHitsRect(cx, cy, r, x, y, w, h) {
  const dx = cx - clamp(cx, x, x + w);
  const dy = cy - clamp(cy, y, y + h);
  return dx * dx + dy * dy < r * r;
}

// Repeats an image side by side on an offscreen canvas. Drawing one window of it
// avoids the seams that show between separate tiles of semi-transparent art.
// trim removes soft edge columns from each side of the source image.
function makeStrip(img, scale, trim = 0) {
  const period = img.width - trim * 2;
  const copies = Math.ceil(WIDTH / (period * scale)) + 1;
  const canvas = document.createElement("canvas");
  canvas.width = period * copies;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < copies; i++) {
    ctx.drawImage(img, trim, 0, period, img.height, i * period, 0, period, img.height);
  }
  return { canvas, period };
}

export class Game {
  constructor(images, audio) {
    this.images = images;
    this.audio = audio;
    this.best = readBestScore();
    this.time = 0;
    this.paused = false;

    const s = WORLD.stripScale;
    this.groundHeight = images.ground.height * s;
    this.groundY = HEIGHT - this.groundHeight;
    this.bushesY = this.groundY - images.bushes.height * s + 4;
    this.buildingsY = this.bushesY - images.buildings.height * s + 30;
    this.cloudLayerY = this.buildingsY - images.cloudLayer.height * s + 45;

    this.strips = {
      cloudLayer: makeStrip(images.cloudLayer, s),
      buildings: makeStrip(images.buildings, s),
      bushes: makeStrip(images.bushes, s),
      ground: makeStrip(images.ground, s, 1),
    };

    this.pipeWidth = images.pipe.width * PIPES.scale;
    this.pipeHeight = images.pipe.height * PIPES.scale;
    this.birdFrameWidth = images.bird.width / BIRD.frames;

    this.clouds = Array.from({ length: 4 }, (_, i) => this.#makeCloud(i * 110));
    this.#toMenu();
  }

  // Input handling

  input() {
    this.audio.unlock();
    if (this.paused) {
      this.resume();
      return;
    }
    switch (this.state) {
      case State.MENU:
        this.#start();
        break;
      case State.PLAYING:
        this.#flap();
        break;
      case State.OVER:
        if (this.stateTime >= GAME_OVER_INPUT_DELAY) this.#start();
        break;
    }
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  pause() {
    if (this.state !== State.PLAYING || this.paused) return;
    this.paused = true;
    this.audio.pauseMusic();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.audio.resumeMusic();
  }

  // State changes

  #toMenu() {
    this.state = State.MENU;
    this.stateTime = 0;
    this.scroll = 0;
    this.score = 0;
    this.pipes = [];
    this.flash = 0;
    this.bird = { x: WIDTH / 2, y: HEIGHT * 0.45, vy: 0, angle: 0, frameTime: 0 };
    this.audio.music("menu");
  }

  #start() {
    // From the menu the bird glides to its place. After a game over it starts there.
    const fromMenu = this.state === State.MENU;
    this.state = State.PLAYING;
    this.stateTime = 0;
    this.score = 0;
    this.newBest = false;
    this.flash = 0;
    this.pipes = [];
    this.bird = {
      x: fromMenu ? this.bird.x : BIRD.x,
      y: HEIGHT * 0.45,
      vy: 0,
      angle: 0,
      frameTime: 0,
    };
    this.#spawnPipe(WIDTH + PIPES.firstOffset);
    this.audio.music("game", { volume: 0.4 });
    this.#flap();
  }

  #flap() {
    this.bird.vy = BIRD.flapVelocity;
    this.audio.play("flap", 0.7);
  }

  #die() {
    this.state = State.DYING;
    this.stateTime = 0;
    this.flash = 1;
    this.audio.stopMusic();
    this.audio.play("hit");
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      localStorage.setItem(BEST_SCORE_KEY, String(this.best));
    }
  }

  #gameOver() {
    this.state = State.OVER;
    this.stateTime = 0;
    this.audio.music("gameOverVoice", {
      loop: false,
      volume: 0.9,
      onEnded: () => {
        if (this.state === State.OVER) this.audio.music("gameOver", { volume: 0.4 });
      },
    });
  }

  // Update

  update(dt) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.#updateClouds(dt);
    if (this.paused) return;
    this.stateTime += dt;

    switch (this.state) {
      case State.MENU:
        this.scroll += WORLD.speed * dt;
        this.bird.y = HEIGHT * 0.45 + Math.sin(this.time * 4) * 8;
        this.bird.frameTime += dt;
        break;
      case State.PLAYING:
        this.scroll += WORLD.speed * dt;
        this.bird.x += (BIRD.x - this.bird.x) * Math.min(1, dt * 5);
        this.#updateBird(dt);
        this.#updatePipes(dt);
        this.#checkCollisions();
        break;
      case State.DYING:
        this.#updateBird(dt);
        if (this.bird.y + BIRD.hitRadius >= this.groundY) {
          this.bird.y = this.groundY - BIRD.hitRadius;
          this.#gameOver();
        }
        break;
      case State.OVER:
        break;
    }
  }

  #updateBird(dt) {
    const bird = this.bird;
    bird.vy = Math.min(bird.vy + BIRD.gravity * dt, BIRD.maxFallSpeed);
    bird.y += bird.vy * dt;
    bird.frameTime += dt;

    // Tilt up after a flap, then nose down while falling.
    const target = bird.vy < 0 ? -0.4 : clamp((bird.vy / BIRD.maxFallSpeed) * 1.6, -0.4, 1.45);
    bird.angle += (target - bird.angle) * Math.min(1, dt * (bird.vy < 0 ? 20 : 6));
  }

  #updatePipes(dt) {
    for (const pipe of this.pipes) {
      pipe.x -= WORLD.speed * dt;
      if (!pipe.scored && pipe.x + this.pipeWidth / 2 < this.bird.x) {
        pipe.scored = true;
        this.score += 1;
        this.audio.play("point", 0.6);
      }
    }
    this.pipes = this.pipes.filter((pipe) => pipe.x + this.pipeWidth > -10);

    const last = this.pipes[this.pipes.length - 1];
    if (!last || last.x + PIPES.spacing <= WIDTH + this.pipeWidth) {
      this.#spawnPipe(last ? last.x + PIPES.spacing : WIDTH + PIPES.firstOffset);
    }
  }

  #spawnPipe(x) {
    const half = PIPES.gap / 2;
    const min = PIPES.margin + half;
    const max = this.groundY - PIPES.margin - half;
    const previous = this.pipes[this.pipes.length - 1];
    // Limit the jump between two gaps so every gap is reachable.
    const low = previous ? Math.max(min, previous.gapY - 170) : min;
    const high = previous ? Math.min(max, previous.gapY + 170) : max;
    this.pipes.push({ x, gapY: random(low, high), scored: false });
  }

  #checkCollisions() {
    const { x, y } = this.bird;
    const r = BIRD.hitRadius;

    if (y - r <= 0 || y + r >= this.groundY) {
      this.#die();
      if (y + r >= this.groundY) this.#gameOver();
      return;
    }

    const inset = PIPES.hitInset;
    const half = PIPES.gap / 2;
    for (const pipe of this.pipes) {
      const px = pipe.x + inset;
      const pw = this.pipeWidth - inset * 2;
      if (
        circleHitsRect(x, y, r, px, -HEIGHT, pw, HEIGHT + pipe.gapY - half) ||
        circleHitsRect(x, y, r, px, pipe.gapY + half, pw, HEIGHT)
      ) {
        this.#die();
        return;
      }
    }
  }

  #makeCloud(x) {
    const large = Math.random() < 0.4;
    return {
      img: large ? this.images.cloudLarge : this.images.cloudSmall,
      x,
      y: random(20, this.cloudLayerY - 40),
      scale: large ? random(0.25, 0.35) : random(0.3, 0.45),
      speed: random(8, 20),
    };
  }

  #updateClouds(dt) {
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      cloud.x -= cloud.speed * dt;
      if (cloud.x + cloud.img.width * cloud.scale < 0) {
        this.clouds[i] = this.#makeCloud(WIDTH + random(10, 120));
      }
    }
  }

  // Rendering

  render(ctx) {
    const { images } = this;

    ctx.fillStyle = SKY_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const logoScale = 0.45;
    const logoWidth = images.sescompLogo.width * logoScale;
    ctx.drawImage(
      images.sescompLogo,
      (WIDTH - logoWidth) / 2,
      60,
      logoWidth,
      images.sescompLogo.height * logoScale,
    );

    ctx.globalAlpha = 0.85;
    for (const cloud of this.clouds) {
      const { img, x, y, scale } = cloud;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    }
    ctx.globalAlpha = 1;

    this.#drawStrip(ctx, this.strips.cloudLayer, this.scroll * 0.1, this.cloudLayerY);
    this.#drawStrip(ctx, this.strips.buildings, this.scroll * 0.25, this.buildingsY);
    this.#drawStrip(ctx, this.strips.bushes, this.scroll * 0.5, this.bushesY);
    this.#drawPipes(ctx);
    this.#drawStrip(ctx, this.strips.ground, this.scroll, this.groundY);
    this.#drawBird(ctx);

    switch (this.state) {
      case State.MENU:
        this.#drawMenu(ctx);
        break;
      case State.PLAYING:
      case State.DYING:
        this.#drawText(ctx, String(this.score), WIDTH / 2, 70, 48);
        break;
      case State.OVER:
        this.#drawGameOver(ctx);
        break;
    }

    if (this.paused) this.#drawPaused(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flash})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  #drawStrip(ctx, strip, offset, y) {
    const scale = WORLD.stripScale;
    const sourceX = (offset / scale) % strip.period;
    const height = strip.canvas.height;
    ctx.drawImage(strip.canvas, sourceX, 0, WIDTH / scale, height, 0, y, WIDTH, height * scale);
  }

  #drawPipes(ctx) {
    const { pipe } = this.images;
    const half = PIPES.gap / 2;
    for (const { x, gapY } of this.pipes) {
      ctx.drawImage(pipe, x, gapY + half, this.pipeWidth, this.pipeHeight);
      ctx.save();
      ctx.translate(x, gapY - half);
      ctx.scale(1, -1);
      ctx.drawImage(pipe, 0, 0, this.pipeWidth, this.pipeHeight);
      ctx.restore();
    }
  }

  #drawBird(ctx) {
    const { bird } = this.images;
    const { x, y, angle, frameTime } = this.bird;
    const flapping = this.state === State.MENU || this.state === State.PLAYING;
    const frame = flapping ? Math.floor(frameTime * BIRD.frameRate) % BIRD.frames : 1;
    const w = this.birdFrameWidth * BIRD.scale;
    const h = bird.height * BIRD.scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(bird, frame * this.birdFrameWidth, 0, this.birdFrameWidth, bird.height, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Drops the logo in from the top, then rocks it, like the original Unity logo script.
  #drawLogo(ctx, img, scale, y) {
    const t = this.stateTime;
    const drop = clamp(t / 0.7, 0, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.save();
    ctx.translate(WIDTH / 2, y - (1 - easeOutBack(drop)) * 220);
    ctx.rotate(Math.sin(this.time * 2.5) * 0.05);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  #drawMenu(ctx) {
    this.#drawLogo(ctx, this.images.titleLogo, 0.8, 150);
    if (Math.floor(this.time * 2) % 2 === 0) {
      this.#drawText(ctx, "TAP TO START", WIDTH / 2, 380, 24);
    }
    this.#drawText(ctx, "SPACE, CLICK OR TAP TO FLAP", WIDTH / 2, this.groundY + 70, 13);
    if (this.best > 0) {
      this.#drawText(ctx, `BEST ${this.best}`, WIDTH / 2, this.groundY + 100, 16);
    }
  }

  #drawGameOver(ctx) {
    this.#drawLogo(ctx, this.images.gameOverLogo, 0.62, 140);

    const panelW = 220;
    const panelH = 130;
    const panelX = (WIDTH - panelW) / 2;
    const panelY = 215 + (1 - easeOutBack(clamp((this.stateTime - 0.2) / 0.5, 0, 1))) * HEIGHT;

    ctx.fillStyle = "#fdf6e3";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 14);
    ctx.fill();
    ctx.stroke();

    const label = { fill: "#c58b57", stroke: null };
    this.#drawText(ctx, "SCORE", WIDTH / 2, panelY + 24, 14, label);
    this.#drawText(ctx, String(this.score), WIDTH / 2, panelY + 52, 30);
    this.#drawText(ctx, "BEST", WIDTH / 2, panelY + 84, 14, label);
    this.#drawText(ctx, String(this.best), WIDTH / 2, panelY + 110, 22);

    if (this.newBest) {
      ctx.save();
      ctx.translate(panelX + panelW - 6, panelY + 8);
      ctx.rotate(0.3);
      this.#drawText(ctx, "NEW!", 0, 0, 16, { fill: "#ff5a5a" });
      ctx.restore();
    }

    if (this.stateTime >= GAME_OVER_INPUT_DELAY && Math.floor(this.time * 2) % 2 === 0) {
      this.#drawText(ctx, "TAP TO PLAY AGAIN", WIDTH / 2, 400, 20);
    }
  }

  #drawPaused(ctx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.#drawText(ctx, "PAUSED", WIDTH / 2, HEIGHT * 0.4, 40);
    this.#drawText(ctx, "TAP TO CONTINUE", WIDTH / 2, HEIGHT * 0.4 + 50, 18);
  }

  #drawText(ctx, text, x, y, size, { fill = "#fff", stroke = "#333" } = {}) {
    ctx.font = `${size}px "Byte", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (stroke) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, size / 9);
      ctx.strokeStyle = stroke;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
}
