const IMAGES = {
  bird: "assets/images/bird.png",
  pipe: "assets/images/pipe.png",
  ground: "assets/images/ground.png",
  bushes: "assets/images/bushes.png",
  buildings: "assets/images/buildings.png",
  cloudLayer: "assets/images/cloud-layer.png",
  cloudSmall: "assets/images/cloud-small.png",
  cloudLarge: "assets/images/cloud-large.png",
  sescompLogo: "assets/images/sescomp-logo.png",
  titleLogo: "assets/images/title-logo.png",
  gameOverLogo: "assets/images/game-over-logo.png",
};

export const SOUNDS = {
  flap: "assets/audio/flap.m4a",
  point: "assets/audio/point.m4a",
  hit: "assets/audio/hit.m4a",
};

export const MUSIC = {
  menu: "assets/audio/menu-theme.mp3",
  game: "assets/audio/game-theme.mp3",
  gameOver: "assets/audio/game-over-theme.mp3",
  gameOverVoice: "assets/audio/game-over-voice.mp3",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

export async function loadImages() {
  const entries = await Promise.all(
    Object.entries(IMAGES).map(async ([name, src]) => [name, await loadImage(src)]),
  );
  return Object.fromEntries(entries);
}

export async function loadFont() {
  try {
    await document.fonts.load('32px "Byte"');
  } catch {
    // The game falls back to the default font.
  }
}
