// All sizes are in logical pixels. The canvas scales this space to fit the screen.
export const WIDTH = 360;
export const HEIGHT = 640;

export const SKY_COLOR = "#54bfca";

// Physics runs at a fixed step so the game feels the same at any refresh rate.
export const FIXED_STEP = 1 / 120;

export const BIRD = {
  x: 96,
  scale: 0.42,
  frames: 4,
  frameRate: 12,
  hitRadius: 14,
  gravity: 1700,
  flapVelocity: -470,
  maxFallSpeed: 720,
};

export const WORLD = {
  speed: 165,
  // The ground, bushes, buildings and cloud strips share one scale.
  stripScale: 0.55,
};

export const PIPES = {
  scale: 0.56,
  gap: 150,
  spacing: 225,
  firstOffset: 140,
  // Smallest distance between a gap edge and the sky or the ground.
  margin: 55,
  hitInset: 3,
};

export const GAME_OVER_INPUT_DELAY = 0.8;

export const BEST_SCORE_KEY = "flappycomp.best";
export const MUTED_KEY = "flappycomp.muted";
