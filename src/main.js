import { WIDTH, HEIGHT, SKY_COLOR, FIXED_STEP } from "./config.js";
import { loadImages, loadFont, SOUNDS, MUSIC } from "./assets.js";
import { AudioManager } from "./audio.js";
import { Game } from "./game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const muteButton = document.getElementById("mute");

function resize() {
  const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(WIDTH * scale)}px`;
  canvas.style.height = `${Math.floor(HEIGHT * scale)}px`;
  canvas.width = Math.round(WIDTH * scale * dpr);
  canvas.height = Math.round(HEIGHT * scale * dpr);
}

function applyTransform() {
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  ctx.imageSmoothingQuality = "high";
}

function drawLoading(text) {
  applyTransform();
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#fff";
  ctx.font = '20px "Byte", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, WIDTH / 2, HEIGHT / 2);
}

async function boot() {
  resize();
  window.addEventListener("resize", resize);
  drawLoading("LOADING...");

  const audio = new AudioManager(SOUNDS, MUSIC);
  let images;
  try {
    [images] = await Promise.all([loadImages(), loadFont(), audio.ready]);
  } catch (error) {
    console.error(error);
    drawLoading("COULD NOT LOAD THE GAME");
    return;
  }

  const game = new Game(images, audio);
  // Open the page with ?debug to reach the game object from the console.
  if (new URLSearchParams(location.search).has("debug")) window.game = game;
  muteButton.classList.toggle("muted", audio.muted);

  window.addEventListener("pointerdown", (event) => {
    if (event.target.closest("#mute")) return;
    event.preventDefault();
    game.input();
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    switch (event.code) {
      case "Space":
      case "ArrowUp":
      case "KeyW":
      case "Enter":
        event.preventDefault();
        game.input();
        break;
      case "KeyP":
      case "Escape":
        game.togglePause();
        break;
      case "KeyM":
        muteButton.classList.toggle("muted", audio.toggleMute());
        break;
    }
  });

  muteButton.addEventListener("click", () => {
    audio.unlock();
    muteButton.classList.toggle("muted", audio.toggleMute());
    muteButton.blur();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      game.pause();
      audio.pauseMusic();
    } else if (!game.paused) {
      audio.resumeMusic();
    }
  });

  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    // Clamp long frames, for example after the tab was in the background.
    accumulator += Math.min((now - last) / 1000, 0.1);
    last = now;
    while (accumulator >= FIXED_STEP) {
      game.update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    applyTransform();
    game.render(ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
