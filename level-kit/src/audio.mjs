export function createSoundClass({ CONFIG, seededRandom }) {
  const impactTones = [
    [260, 86, .13, .28, 'sawtooth'], [112, 35, .23, .42, 'triangle'],
    [610, 150, .18, .21, 'square'], [84, 29, .32, .40, 'sawtooth'],
  ];
  class Sound {
    constructor() {
      this.enabled = !CONFIG.audio.muted;
      this.nextHeartbeat = this.nextCue = this.cueNumber = 0;
      this.lowHealth = false;
      this.nearby = [];
    }
    open() {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio();
        this.main = this.ctx.createGain();
        this.main.gain.value = this.enabled ? CONFIG.audio.volume * 0.65 : 0;
        this.main.connect(this.ctx.destination);
        this.combat = this.ctx.createGain();
        this.combat.connect(this.main);
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
          this.ambientFilter = this.ctx.createBiquadFilter();
          this.ambientFilter.type = 'lowpass';
          this.ambientFilter.frequency.value = 20000;
          noise.connect(filter).connect(this.ambientFilter).connect(this.ambientVolume).connect(this.main);
          noise.start();
        }
      }
      this.ctx.resume().catch(() => {});
    }
    toggle() {
      this.enabled = !this.enabled;
      if (this.ctx) this.main.gain.setTargetAtTime(this.enabled ? CONFIG.audio.volume * 0.65 : 0, this.ctx.currentTime, 0.055);
    }
    active(active) {
      if (this.combat) this.combat.gain.setTargetAtTime(Number(active), this.ctx.currentTime, .015);
      if (!active) {
        this.setLowHealth(false);
        this.nextHeartbeat = this.nextCue = this.cueNumber = 0;
      }
      if (!this.ambientVolume) return;
      const ambient = CONFIG.audio.ambient;
      this.ambientVolume.gain.setTargetAtTime(active ? ambient.activeGain ?? 0.24 : ambient.pauseGain ?? 0.14, this.ctx.currentTime, 0.18);
    }
    tone(from, to, seconds, volume, type = 'sine', delay = 0, output = this.main) {
      if (!this.ctx || !this.enabled) return;
      const at = this.ctx.currentTime + delay, end = at + seconds;
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, end);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.012, seconds / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(output); osc.start(at); osc.stop(end);
      return osc;
    }
    hiss(seconds, from, to, volume, delay = 0, output = this.main) {
      if (!this.ctx || !this.enabled) return;
      const at = this.ctx.currentTime + delay, end = at + seconds;
      const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
      source.buffer = this.noise; source.loop = true;
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(from, at); filter.frequency.exponentialRampToValueAtTime(to, end);
      gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(seconds * 0.3, 0.013));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(filter).connect(gain).connect(output); source.start(at, Math.random() * 2); source.stop(end);
      return source;
    }
    hurt(kind) {
      this.tone(...(impactTones[kind] ?? [95, 37, .19, .28, 'triangle']));
    }
    setLowHealth(low) {
      if (this.lowHealth === low) return;
      this.lowHealth = low;
      if (this.ambientFilter) this.ambientFilter.frequency.setTargetAtTime(low ? 680 : 20000, this.ctx.currentTime, .12);
    }
    spatialCue(b, player, cue) {
      if (!this.ctx || !this.enabled) return;
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      const dx = b.x - player.x, dz = b.z - player.z, yaw = player.look.rotation.y;
      // 用玩家水平朝向换算到监听者坐标，低头或受击镜头偏转不改变脚步方位。
      panner.setPosition(Math.cos(yaw)*dx - Math.sin(yaw)*dz,
        b.y + b.height * .45 - player.y - player.eye, Math.sin(yaw)*dx + Math.cos(yaw)*dz);
      panner.connect(this.combat);
      let voice;
      if (cue === 'charge') {
        voice = this.tone(145, 470, .26, .5, 'sawtooth', 0, panner);
      } else if (cue === 'step') {
        voice = this.tone(b.type === 0 ? 175 : 105, 46, .10, .32, 'triangle', 0, panner);
      } else {
        voice = this.hiss(.22, 1250, 210, .26, 0, panner);
      }
      voice.onended = () => panner.disconnect();
    }
    updateThreats(game) {
      if (!this.ctx || !this.enabled || game.phase !== 'play') return;
      const now = this.ctx.currentTime, p = game.player;
      this.setLowHealth(p.hp / CONFIG.player.health < CONFIG.feedback.criticalHealth);
      if (this.lowHealth && now >= this.nextHeartbeat) {
        this.tone(82, 38, .13, .38, 'sine', 0, this.combat);
        this.tone(69, 34, .11, .26, 'sine', .16, this.combat);
        this.nextHeartbeat = now + .74;
      }
      if (now < this.nextCue || game.blast || game.encounter?.beastsDisabled) return;
      this.nextCue = now + .25;
      const nearby = this.nearby;
      nearby.length = 0;
      const distance = b => (b.x-p.x)**2 + (b.y-p.y)**2 + (b.z-p.z)**2;
      for (const b of game.beasts.pool) {
        if (b.active && distance(b) <= CONFIG.feedback.warningRange**2) nearby.push(b);
      }
      nearby.sort((a,b) => distance(a) - distance(b));
      const count = Math.min(nearby.length, CONFIG.feedback.warningCount);
      if (count) {
        const b = nearby[this.cueNumber % count];
        const stepping = b.stride > .2 && Math.floor(this.cueNumber / count) % 2 === 0;
        this.spatialCue(b, p, stepping ? 'step' : 'breath');
        this.cueNumber++;
      }
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
