import { MUTED_KEY } from "./config.js";

// Short effects use Web Audio so they can overlap with no delay.
// Long music tracks stream through <audio> elements.
export class AudioManager {
  constructor(sounds, music) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = AudioContextClass ? new AudioContextClass() : null;
    this.buffers = {};
    this.tracks = {};
    this.current = null;
    this.blocked = false;
    this.muted = localStorage.getItem(MUTED_KEY) === "1";

    for (const [name, src] of Object.entries(music)) {
      const el = new Audio(src);
      el.preload = "auto";
      this.tracks[name] = el;
    }
    this.ready = this.#loadSounds(sounds);
  }

  async #loadSounds(sounds) {
    if (!this.ctx) return;
    await Promise.all(
      Object.entries(sounds).map(async ([name, src]) => {
        try {
          const data = await (await fetch(src)).arrayBuffer();
          this.buffers[name] = await new Promise((resolve, reject) =>
            this.ctx.decodeAudioData(data, resolve, reject),
          );
        } catch {
          // A missing effect must not stop the game.
        }
      }),
    );
  }

  // Browsers only allow sound after a user gesture. Call this from input handlers.
  unlock() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    if (this.blocked && this.current && !this.muted) this.#play(this.current);
  }

  play(name, volume = 1) {
    const buffer = this.buffers[name];
    if (this.muted || !buffer || this.ctx.state === "closed") return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(this.ctx.destination);
    source.start();
  }

  music(name, { loop = true, volume = 0.5, onEnded = null } = {}) {
    const track = this.tracks[name];
    if (this.current === track) return;
    this.stopMusic();
    track.loop = loop;
    track.volume = volume;
    track.currentTime = 0;
    track.onended = onEnded;
    this.current = track;
    if (!this.muted) this.#play(track);
  }

  stopMusic() {
    if (!this.current) return;
    this.current.pause();
    this.current.onended = null;
    this.current = null;
  }

  pauseMusic() {
    this.current?.pause();
  }

  resumeMusic() {
    if (this.current && !this.muted) this.#play(this.current);
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(MUTED_KEY, this.muted ? "1" : "0");
    if (this.muted) this.pauseMusic();
    else this.resumeMusic();
    return this.muted;
  }

  #play(track) {
    // play() fails when autoplay is blocked. unlock() tries again later.
    this.blocked = false;
    track.play().catch(() => {
      if (track === this.current) this.blocked = true;
    });
  }
}
