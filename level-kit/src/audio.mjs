export function createSoundClass({ CONFIG, seededRandom }) {
  class Sound {
    constructor() { this.enabled = true; }
    open() {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio();
        this.main = this.ctx.createGain();
        this.main.gain.value = this.enabled ? 0.52 : 0;
        this.main.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
        const samples = this.noise.getChannelData(0);
        const rng = seededRandom(71);
        for (let i = 0; i < samples.length; i++) samples[i] = rng() * 2 - 1;
        const ambient = CONFIG.audio.ambient;
        if (ambient) {
          const noise = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter();
          this.ambientVolume = this.ctx.createGain();
          noise.buffer = this.noise; noise.loop = true;
          filter.type = ambient.filter ?? 'bandpass';
          filter.frequency.value = ambient.frequency ?? 1700;
          filter.Q.value = ambient.q ?? 0.52;
          this.ambientVolume.gain.value = ambient.activeGain ?? 0.24;
          noise.connect(filter).connect(this.ambientVolume).connect(this.main);
          noise.start();
        }
      }
      this.ctx.resume().catch(() => {});
    }
    toggle() {
      this.enabled = !this.enabled;
      if (this.ctx) this.main.gain.setTargetAtTime(this.enabled ? 0.52 : 0, this.ctx.currentTime, 0.055);
    }
    active(active) {
      if (!this.ambientVolume) return;
      const ambient = CONFIG.audio.ambient;
      this.ambientVolume.gain.setTargetAtTime(active ? ambient.activeGain ?? 0.24 : ambient.pauseGain ?? 0.14, this.ctx.currentTime, 0.18);
    }
    tone(from, to, seconds, volume, type = 'sine', delay = 0) {
      if (!this.ctx || !this.enabled) return;
      const at = this.ctx.currentTime + delay, end = at + seconds;
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, end);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.012, seconds / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(this.main); osc.start(at); osc.stop(end);
    }
    hiss(seconds, from, to, volume, delay = 0) {
      if (!this.ctx || !this.enabled) return;
      const at = this.ctx.currentTime + delay, end = at + seconds;
      const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
      source.buffer = this.noise; source.loop = true;
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(from, at); filter.frequency.exponentialRampToValueAtTime(to, end);
      gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(seconds * 0.3, 0.013));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(filter).connect(gain).connect(this.main); source.start(at, Math.random() * 2); source.stop(end);
    }
    shoot() { this.hiss(0.097, 3700, 270, 0.58); this.tone(112, 39, 0.10, 0.36, 'triangle'); }
    hit(killed) {
      this.tone(killed ? 615 : 990, killed ? 1010 : 570, killed ? 0.20 : 0.063, 0.19, 'triangle');
      if (killed) this.tone(410, 675, 0.23, 0.14, 'sine', 0.07);
    }
    reload(finished = false) {
      this.hiss(0.096, 2200, 690, 0.18);
      this.tone(finished ? 440 : 195, 106, 0.11, 0.16, 'triangle', 0.025);
    }
    pickup(rare) { this.tone(rare ? 720 : 445, rare ? 1180 : 665, 0.19, 0.18, 'triangle'); }
    blast() { this.hiss(2.1, 4600, 63, 0.76); this.tone(122, 24, 1.28, 0.60, 'triangle'); }
  }

  return Sound;
}
