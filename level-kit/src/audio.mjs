export function createSoundClass({ CONFIG, seededRandom,score }) {
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
      this.voices=new Set();
      this.stagePlaying=new Map();
      this.resetStage();
    }
    resetStage() { this.nextBed=0;this.dangerPhase='calm';this.storyPhase=null;this.stageCooldown=new Map();this.spatialCount=0;this.spatialTime=-1; }
    stopVoices() { for(const node of this.voices) {try{node.stop();}catch{ /* 已结束 */ }} this.voices.clear();this.stagePlaying.clear(); }
    track(node) {
      if(!node.addEventListener) return;
      this.voices.add(node);
      this.stageNodes?.push(node);
      node.addEventListener('ended',()=>this.voices.delete(node),{once:true});
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
        this.gun = this.ctx.createGain();
        this.gun.connect(this.combat);
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
        this.stopVoices();
        this.setLowHealth(false);
        this.nextHeartbeat = this.nextCue = this.cueNumber = 0;
      }
      if (!this.ambientVolume) return;
      const ambient = CONFIG.audio.ambient;
      this.ambientVolume.gain.setTargetAtTime(active ? ambient.activeGain ?? .24 : 0, this.ctx.currentTime,.06);
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
      this.track(osc);
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
      this.track(source);
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
        if(score?.id==='shanhai-secret-realm') this.hiss(.21,250,780,.27,0,panner);
        voice = this.tone(145, 470, .26, .5, 'sawtooth', 0, panner);
      } else if (cue === 'step') {
        const surface=score?.id;
        if(surface==='rain-city' || b.clinging || b.climbRoute)
          voice=this.hiss(.14,b.clinging||b.climbRoute?2000:820,260,.23,0,panner);
        else if(surface==='buried-tomb') voice=this.tone(530,190,.08,.20,'square',0,panner);
        else voice = this.tone(b.type === 0 ? 175 : 105, 46, .10, .32, 'triangle', 0, panner);
      } else {
        voice = this.hiss(.22, 1250, 210, .26, 0, panner);
      }
      voice.onended = () => panner.disconnect();
    }
    updateThreats(game) {
      if (!this.ctx || game.phase !== 'play') return;
      if(score) this.updateStage(game);
      if(!this.enabled) return;
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
    stageEvent(kind,game,pos) {
      if(!score || !this.ctx || !this.enabled || game.phase!=='play') return;
      const active=this.stagePlaying.get(kind) ?? new Set();
      if(active.size >= (kind==='warning' ? 3 : 2)) return;
      const batch=kind==='warning' && pos;
      if(batch && this.spatialTime!==game.time){this.spatialTime=game.time;this.spatialCount=0;}
      if(batch && this.spatialCount>=3) return;
      const key=batch?kind+':'+Math.round(pos.x)+':'+Math.round(pos.z):kind;
      if((this.stageCooldown.get(key) ?? -1)>game.time) return;
      this.stageCooldown.set(key,game.time+(kind==='rotor' ? .48 : kind==='impact' ? .35 : .12));
      if(batch)this.spatialCount++;
      let output=this.combat;
      if(pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
        const p=game.player, dx=pos.x-p.x,dz=pos.z-p.z,yaw=p.look.rotation.y;
        output=this.ctx.createPanner();output.panningModel='HRTF';output.refDistance=9;
        output.setPosition(Math.cos(yaw)*dx-Math.sin(yaw)*dz,(pos.y ?? p.y+1)-p.y-p.eye,Math.sin(yaw)*dx+Math.cos(yaw)*dz);
        output.connect(this.combat);
      }
      if(kind!=='ambient' && this.gun) {
        const gain=this.gun.gain,now=this.ctx.currentTime;
        gain.cancelScheduledValues(now);
        gain.setTargetAtTime(.38,now,.018);
        gain.setTargetAtTime(1,now+.30,.10);
      }
      this.stageNodes=[];
      score.play(this,kind,output);
      const nodes=this.stageNodes;
      this.stageNodes=null;
      if(nodes.length) {
        active.add(nodes);this.stagePlaying.set(kind,active);
        let remaining=nodes.length;
        for(const node of nodes) node.addEventListener('ended',()=>{
          if(--remaining) return;
          active.delete(nodes);
          if(output!==this.combat) output.disconnect();
        },{once:true});
      }
    }
    updateStage(game) {
      const enc=game.encounter ?? {}, id=score.id, t=game.time, p=game.player;
      if(t>=this.nextBed) {
        this.nextBed=t+score.interval;
        if(this.stageCooldown.size>48) for(const [key,end] of this.stageCooldown) if(end<=t) this.stageCooldown.delete(key);
        const indoor=enc.shelter || (id==='rain-city' && /室|商铺|地铁|隧道/.test(game.level.area(p.x,p.z,p.y)));
        if(this.ambientVolume) this.ambientVolume.gain.setTargetAtTime((CONFIG.audio.ambient.activeGain ?? .24)*(enc.hudOffline ? .04 : indoor ? .35 : 1),this.ctx.currentTime,.16);
        if(!enc.hudOffline) this.stageEvent('ambient',game);
      }
      const state=enc.phase ?? (id==='polar-station' ? enc.temperature<68?'warning':'calm' :
        id==='buried-tomb' ? enc.hearingOnly?'active':enc.status?'warning':'calm' :
        enc.active===true?'active':enc.warned?'warning':'calm');
      if(state!==this.dangerPhase) {
        this.dangerPhase=state;
        const region=enc.region, panel=enc.panel?.collider;
        const rect=region ?? panel;
        const source=region?.wall ? {x:region.wall[0],y:region.wall[1],z:region.wall[2]} :
          rect ? {x:(rect.x0+rect.x1)/2,z:(rect.z0+rect.z1)/2}:undefined;
        const kind=state==='warning'?'warning':['active','open','flood','rise','rain','off'].includes(state)?'danger':state==='calm'?'clear':null;
        if(kind) {
          if(id==='underground-lab' && kind==='danger') this.stageEvent('warning',game);
          this.stageEvent(kind,game,source);
        }
      }
      const story=game.story?.stage;
      if(story!==this.storyPhase) {
        if(this.storyPhase && story && game.story.managed) this.stageEvent(story==='defend'||story==='hold'?'warning':'clear',game,game.level.gate);
        this.storyPhase=story;
      }
    }
    shoot(pellets) {
      this.hiss(pellets ? .16 : .097, pellets ? 1800 : 3700, 270, .58,0,this.gun);
      this.tone(pellets ? 92 : 112, 39, pellets ? .18 : .10, .36, 'triangle',0,this.gun);
    }
    hit(rank, combo = 0) {
      const killed = rank >= 3, weak = rank === 2 || rank === 4;
      const pitch = 1 + Math.min(12, combo) * .018;
      this.tone((weak ? 1360 : killed ? 615 : 990) * pitch, (killed ? 1010 : 570) * pitch,
        weak ? .10 : .063, .19, weak ? 'sine' : 'triangle');
      if (killed) this.tone(410 * pitch, 675 * pitch, .20, .14, 'sine', .045);
      if (weak) this.tone(1830, 1420, .055, .10, 'sine', .025);
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
