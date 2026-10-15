/** Sound: short effects through the Web Audio API, and one looping track at a time. Everything is optional, and silent until the first click (browsers insist). */

const SFX = ["click", "coin", "coins", "levelup", "select", "back", "error", "confirm", "bell", "hit", "hit_soft", "hit_heavy", "open", "drop", "toggle", "glass"] as const;
export type Sfx = (typeof SFX)[number];
const MUSIC = ["menu", "boss", "victory"] as const;
export type Track = (typeof MUSIC)[number];

export class Audio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private musicEl: HTMLAudioElement | null = null;
  private current: Track | null = null;
  muted = false;
  sfxVolume = 0.8;
  musicVolume = 0.4;

  /** Called from a click or key press: the first one wakes the audio up. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    if (this.current) this.music(this.current);
  }

  private load(name: string, path: string): Promise<AudioBuffer | null> {
    const cached = this.loading.get(name);
    if (cached) return cached;
    const promise = (async () => {
      try {
        if (!this.ctx) return null;
        const data = await (await fetch(path)).arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(data);
        this.buffers.set(name, buffer);
        return buffer;
      } catch {
        return null;
      }
    })();
    this.loading.set(name, promise);
    return promise;
  }

  sfx(name: Sfx, volume = 1, rate = 1): void {
    if (this.muted || !this.ctx) return;
    const play = (buffer: AudioBuffer | null) => {
      if (!buffer || !this.ctx || this.muted) return;
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      gain.gain.value = Math.min(1, volume * this.sfxVolume);
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    };
    const have = this.buffers.get(name);
    if (have) play(have);
    else void this.load(name, `assets/sfx/${name}.ogg`).then(play);
  }

  music(track: Track | null): void {
    this.current = track;
    if (!track) {
      this.musicEl?.pause();
      return;
    }
    if (!this.ctx) return; // wait for the first click
    if (!this.musicEl) {
      this.musicEl = new window.Audio();
      this.musicEl.loop = true;
    }
    const el = this.musicEl;
    if (!el.src.endsWith(`/${track}.ogg`)) el.src = `assets/music/${track}.ogg`;
    el.loop = track !== "victory";
    el.volume = this.muted ? 0 : this.musicVolume;
    void el.play().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.musicEl) {
      this.musicEl.volume = muted ? 0 : this.musicVolume;
      if (!muted && this.current) void this.musicEl.play().catch(() => undefined);
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.musicEl && !this.muted) this.musicEl.volume = v;
  }
}
