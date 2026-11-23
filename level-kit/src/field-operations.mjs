import { fieldConfig } from '@level-kit/field-sites.mjs';
import { blastArea } from '@level-kit/foe-traits.mjs';
import { breakBoss } from '@level-kit/boss-fight.mjs';
import { stageBuilder, stairDeck } from '@level-kit/stage-craft.mjs';
import { rayBox } from '@level-kit/world.mjs';

const hazards = [
  { name: '燃料筒', hp: 35, radius: 4.8, damage: 115, color: 0xdd7637 },
  { name: '压力管', hp: 50, radius: 3.6, damage: 16, color: 0x95c54e },
  { name: '悬挂货物', hp: 42, radius: 3.9, damage: 135, color: 0xe9b855 },
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createFieldOperations(context, campaign) {
  const { THREE, level, nav, scene, shapes, definition, campaignStage, CONFIG } = context;
  const cfg = fieldConfig(definition.weaponSkin, campaignStage);
  if (!cfg) return null;
  const eye = new THREE.Vector3(),
    line = new THREE.Vector3();
  function near(p, a, r = 2.5) {
    if (!a || Math.abs(p.y - a.y) >= 1.8 || dist(p, a) >= r) return false;
    eye.set(p.x, p.y + 1.25, p.z);
    line.set(a.x - eye.x, a.y + 1.05 - eye.y, a.z - eye.z);
    const distance = line.length();
    return distance < 0.3 || level.visible(eye, line.divideScalar(distance), distance - 0.24);
  }
  nav.rebuild(level.spawn.x, level.spawn.z);
  const accepted = [];
  function site(desired, radius, requiredGap = 6, allow = () => true) {
    const candidates = level.sites
      .filter((i) => nav.dist[i] >= 0)
      .map((i) => {
        const x = nav.x(i),
          z = nav.z(i),
          y = level.surface(x, z, level.base(x, z) + 0.5);
        return { x, y, z, score: (x - desired[0]) ** 2 + (z - desired[1]) ** 2 };
      })
      .sort((a, b) => a.score - b.score);
    const site = candidates.find(
      (p) =>
        dist(p, level.spawn) > 8 &&
        dist(p, level.gate) > 5 &&
        dist(p, level.bossSpawn) > 5 &&
        accepted.every((a) => dist(p, a) > requiredGap) &&
        allow(p) &&
        !level.blocked(p.x, p.z, p.y, radius, 2.8) &&
        [1, -1].every(
          (s) =>
            Math.abs(level.base(p.x + radius * s, p.z) - p.y) < 0.5 &&
            Math.abs(level.base(p.x, p.z + radius * s) - p.y) < 0.5,
        ),
    );
    if (site) accepted.push(site);
    return site;
  }
  function roomSite(desired) {
    const savedItems = [...(definition.loot ?? []), ...(definition.ammo ?? [])];
    return site(desired, 2.35, 8, (p) => {
      if (savedItems.some(([x, z]) => Math.abs(x - p.x) < 2.5 && Math.abs(z - p.z) < 2.8)) return false;
      // 前后门外都预留通路。贴墙放置可能把门口封进死角，也会挡住原有路线。
      const clear = (x, z) =>
        nav.dist[nav.index(x, z)] >= 0 &&
        !level.blocked(x, z, p.y, 0.72, 2.2) &&
        Math.abs(level.surface(x, z, p.y + 0.45) - p.y) < 0.45;
      return (
        [-1, 1].every((s) => clear(p.x, p.z + s * 3.2)) &&
        [-1, 1].some((s) => [-3.2, -1.6, 0, 1.6, 3.2].every((dz) => clear(p.x + s * 2.9, p.z + dz)))
      );
    });
  }
  const visual = new THREE.Group();
  scene.add(visual);
  const fixed = new context.StaticBatches({
    wall: new THREE.MeshLambertMaterial(),
    glow: new THREE.MeshBasicMaterial(),
  });
  function stamp(kind, mat, color, p, w, h, d, roll = 0) {
    fixed.add(kind, mat, p.x, p.y, p.z, w, h, d, color, 0, 0, roll);
  }
  const materials = new Map();
  function piece(shape, color, p, w, h, d, unlit = false) {
    const key = color + ':' + unlit;
    if (!materials.has(key))
      materials.set(
        key,
        unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }),
      );
    const m = new THREE.Mesh(shape, materials.get(key));
    m.position.set(p.x, p.y, p.z);
    m.scale.set(w, h, d);
    visual.add(m);
    return m;
  }
  const at = (center, x, y, z) => ({ x: center.x + x, y: center.y + y, z: center.z + z });
  const panels = [];
  function panel(p, w, h, d, color, closed, latched = false) {
    const pos = at(p, 0, h / 2, 0);
    const mesh = latched ? piece(shapes.box, color, pos, w, h, d) : null;
    if (!latched) stamp('box', 'wall', color, pos, w, h, d);
    const box = level.box(p.x, p.z, w, d, p.y, p.y + h);
    box.active = false;
    const item = { mesh, box, closed, latched };
    panels.push(item);
    level.setBarrier(box, mesh, closed);
    return item;
  }
  function room(center, hidden, deep = false) {
    if (!center) return null;
    const width = 3.7,
      depth = 4.1,
      color = deep ? 0x493456 : hidden ? 0x535b5b : 0x775c49;
    for (const sign of [-1, 1]) panel(at(center, (sign * width) / 2, 0, 0), 0.18, 2.15, depth, color, true);
    const front = at(center, 0, 0, depth / 2),
      back = at(center, 0, 0, -depth / 2);
    const door = panel(front, width, 2.15, 0.19, color, hidden, true);
    const shortcut = panel(back, width, 2.15, 0.19, color, true, true);
    stamp(
      'box',
      'glow',
      deep ? 0xce78db : hidden ? 0x948e77 : 0xffbd59,
      at(center, 0, 1.25, depth / 2 + 0.11),
      hidden && !deep ? 0.14 : width,
      0.13,
      0.04,
    );
    if (hidden && !deep)
      stamp('box', 'wall', 0x978e71, at(center, 0.13, 1.09, depth / 2 + 0.13), 0.08, 0.32, 0.03, -0.31);
    else stamp('box', 'wall', 0xf6b56c, at(center, 0, 2.15, 0), width, 0.18, depth);
    return { center, front, back, door, shortcut };
  }
  const vault = room(roomSite(cfg.vault), false),
    secret = room(roomSite(cfg.secret), true);
  const deepRoom = cfg.deep ? room(roomSite([cfg.vault[0] * 0.7, -cfg.vault[1]]), true, true) : null;
  const deepExit = deepRoom && secret ? at(secret.front, 0, 0, 1.45) : null;
  const exitBeacon = deepExit
    ? piece(shapes.cylinder, 0xc988ff, at(deepExit, 0, 0.55, 0), 0.4, 1.1, 0.4, true)
    : null;
  const lever = vault ? at(vault.center, 2.45, 0, -1.4) : null;
  let handle;
  if (lever) {
    stamp('box', 'wall', 0x546874, at(lever, 0, 0.52, 0), 0.6, 1.04, 0.5);
    handle = piece(shapes.box, 0x79f5d6, at(lever, 0, 1.19, 0), 0.19, 0.49, 0.16, true);
    handle.rotation.z = -0.4;
  }
  const device = site([level.bossSpawn.x + 5, level.bossSpawn.z], 0.55, 2);
  if (device) {
    stamp('cylinder', 'wall', 0x566274, at(device, 0, 0.4, 0), 0.85, 0.8, 0.85);
    stamp('cylinder', 'glow', 0x64dcfc, at(device, 0, 0.89, 0), 0.62, 0.23, 0.62);
  }
  const traps = [];
  const ringGeometry = new THREE.RingGeometry(0.96, 1, 32);
  for (let i = 0; i < 3; i++) {
    const desired =
      i === 1 && traps.length
        ? [traps[0].p.x + 3.8, traps[0].p.z]
        : [cfg.vault[0] * 0.6, cfg.secret[1] + i * 3];
    const data = { ...hazards[i], name: cfg.hazards[i] },
      candidate = site(desired, 0.72, 3.3);
    if (!candidate) continue;
    const y = i === 2 ? 2.9 : 0.69,
      mesh = piece(
        i === 2 ? shapes.box : shapes.cylinder,
        data.color,
        at(candidate, 0, y, 0),
        1.05,
        1.38,
        1.05,
      );
    const stripe = piece(shapes.box, 0xffd973, at(candidate, 0, y + 0.12, 0), 1.08, 0.15, 1.08, true);
    const ring = piece(
      ringGeometry,
      data.color,
      at(candidate, 0, 0.047, 0),
      data.radius,
      data.radius,
      1,
      true,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    if (i === 2) stamp('box', 'wall', 0x737986, at(candidate, 0, 3.95, 0), 0.07, 1.4, 0.07);
    traps.push({
      type: i,
      data,
      mesh,
      stripe,
      ring,
      p: candidate,
      y,
      box: {
        x0: candidate.x - 0.56,
        x1: candidate.x + 0.56,
        y0: candidate.y + y - 0.69,
        y1: candidate.y + y + 0.69,
        z0: candidate.z - 0.56,
        z1: candidate.z + 0.56,
      },
    });
  }
  fixed.flush(visual);
  if (cfg.vertical) {
    const largest = CONFIG.beasts.types[3];
    const point = site(
      [cfg.secret[0] * -0.85, cfg.secret[1] * -0.8],
      2.6,
      8,
      (p) =>
        Math.abs(p.y) < 0.03 &&
        [-9, -8, -7, -6, -4, -2, 0, 2, 4, 6, 7, 8, 9].every((offset) => {
          const y = 1.92 * Math.max(0, Math.min(1, (6.8 - Math.abs(offset)) / 4.8));
          return (
            Math.abs(level.base(p.x, p.z + offset)) < 0.1 &&
            !level.blocked(p.x, p.z + offset, 0, Math.max(1.7, largest.radius + 0.4), largest.height + y)
          );
        }),
    );
    if (point) {
      const deck = stairDeck(point.x, point.z, 4.4, 4, 4.8, 1.92);
      const builder = stageBuilder(context, { deck: 0x685643, rail: 0x938674 });
      deck.draw(builder, 'deck');
      builder.block('rail', point.x - 2.02, point.z, 0.32, 2.2, 1.92, 2.65, true);
      builder.flush();
      level.extraGround = deck.height;
      level.terrainRevision++;
      level.highPost = at(point, 0.5, 1.92, 0);
      level.stairs = {
        x: point.x,
        z: point.z,
        baseY: 0,
        topY: 1.92,
        deckWidth: 4.4,
        stairWidth: 4.4,
        deckLength: 4,
        run: 4.8,
      };
    }
  }
  const huntSites = [
    vault && at(vault.front, 0, 0, 1.35),
    secret && at(secret.front, 0, 0, 1.35),
    device,
    ...traps.map((t) => t.p),
  ].filter(Boolean);
  let huntRoute,
    tracks = [],
    runNumber = 0,
    field;
  if (cfg.hunt) {
    huntRoute = nav.routeFor(0);
    tracks = Array.from({ length: 18 }, () =>
      piece(shapes.box, 0xaa5950, { x: 0, y: 0, z: 0 }, 0.18, 0.035, 0.41, true),
    );
  }
  function open(part, closed) {
    if (part) level.setBarrier(part.box, part.mesh, closed);
  }
  function treasure(g, p, name, value, origin) {
    const drop = g.pickups.add('rare', p.x, p.z, p.y, name, value, true);
    if (drop) drop.origin = origin;
    return drop;
  }
  function guards(g, p, count, tag, elite = false, offset = 0) {
    const members = [];
    for (let i = 0; i < 90 && members.length < count; i++) {
      const a = i * 2.39996,
        r = 3 + (i % 8),
        x = p.x + Math.cos(a) * r,
        z = p.z + Math.sin(a) * r;
      const y = level.surface(x, z, p.y + 0.46);
      if (Math.abs(y - p.y) > 0.5 || dist({ x, z }, g.player) < 2.5 || nav.dist[nav.index(x, z)] < 0)
        continue;
      if (g.beasts.pool.some((b) => b.active && Math.hypot(x - b.x, z - b.z) < 1.55)) continue;
      const index = offset + members.length;
      const b = g.beasts.spawnRegular(
        cfg.guardTypes[index % cfg.guardTypes.length],
        x,
        z,
        y,
        elite && index % 3 === 0,
      );
      if (b) {
        b.fieldGroup = tag;
        b.alert = 8;
        members.push(b);
      }
    }
    return members;
  }
  function deployWave(g, tag) {
    if (!field.waitingGuards || g.time < field.spawnAt) return;
    const arrivals = guards(
      g,
      tag === 'deep' ? deepRoom.front : vault.front,
      field.waitingGuards,
      tag,
      tag === 'deep',
      field.guardCount - field.waitingGuards,
    );
    for (const b of arrivals) if (tag === 'deep') b.traitSpeed *= 1.23;
    field.guards.push(...arrivals);
    field.waitingGuards -= arrivals.length;
    field.spawnAt = g.time + 0.35;
  }
  function beginWave(g, tag, count) {
    field.guards = [];
    field.guardCount = field.waitingGuards = count;
    field.spawnAt = g.time;
    deployWave(g, tag);
  }
  function releaseTrap(t, g) {
    if (!t.active) return;
    t.active = false;
    t.mesh.visible = t.stripe.visible = false;
    const p = t.p,
      d = t.data;
    g.effects.spray(g.beasts.air.set(p.x, p.y + 1, p.z), g.beasts.bossTint, 22, 5, 0.08, 'spark');
    g.sound.tone(175, 46, 0.25, 0.22, 'triangle');
    t.ring.visible = true;
    t.flashUntil = g.time + 0.6;
    if (t.type === 1) {
      t.lingering = g.time + 4;
      t.tick = g.time;
    } else if (t.type === 2) {
      t.falling = g.time + 0.45;
      t.mesh.visible = true;
    } else {
      blastArea(g, p, d.radius, d.damage);
      for (const other of traps)
        if (other.active && dist(other.p, p) < d.radius && Math.abs(other.p.y - p.y) < 1.5) {
          const origin = g.beasts.air.set(p.x, p.y + 0.6, p.z),
            direction = g.beasts.line.set(other.p.x - p.x, other.p.y - p.y, other.p.z - p.z);
          const length = direction.length();
          if (!length || level.visible(origin, direction.divideScalar(length), length)) releaseTrap(other, g);
        }
    }
  }
  field = {
    cfg,
    vault,
    secret,
    traps,
    device,
    lever,
    deepRoom,
    deepExit,
    reset(g) {
      runNumber++;
      this.enabled = !g.training;
      visual.visible = this.enabled;
      for (const p of panels) open(p, this.enabled && p.closed);
      for (const t of traps) {
        t.hp = t.data.hp;
        t.active = this.enabled;
        t.mesh.visible = t.stripe.visible = true;
        t.mesh.position.y = t.p.y + t.y;
        t.stripe.scale.y = 0.15;
        t.ring.visible = false;
        t.falling = t.lingering = t.tick = t.flashUntil = 0;
      }
      this.guards = [];
      this.vaultStage = 'idle';
      this.waveAt = 0;
      this.secretOpen = false;
      this.switchUsed = false;
      this.deviceAt = 0;
      this.deep = '';
      this.confirmUntil = 0;
      this.legend = null;
      this.deepAt = 0;
      this.deepFinished = false;
      this.hunting = this.enabled && g.objective.mode === 'hunt';
      this.huntWon = false;
      this.prey = null;
      this.traceIndex = 0;
      this.nextFlee = 0;
      for (const t of tracks) {
        t.visible = false;
        t.until = 0;
      }
      if (handle) handle.rotation.z = -0.4;
      if (exitBeacon) exitBeacon.visible = false;
      if (level.highPost) {
        const p = level.highPost;
        g.pickups.add('ammo', p.x, p.z, p.y, '高台弹药', 26, true);
      }
      if (this.hunting) this.startHunt(g);
    },
    startHunt(g) {
      huntRoute.rebuild(g.player.x, g.player.z);
      const size = CONFIG.beasts.types[0];
      const options = huntSites.filter(
        (p) =>
          huntRoute.dist[huntRoute.index(p.x, p.z)] >= 0 &&
          dist(p, level.spawn) > 9 &&
          !level.blocked(p.x, p.z, p.y, size.radius, size.height),
      );
      if (!options.length) throw Error('猎场缺少可达藏匿点');
      const p = options[Math.floor(Math.random() * options.length)];
      this.prey = g.beasts.spawn(0, p.x, p.z, p.y);
      if (!this.prey) throw Error('猎物出生点无净空');
      this.prey.hunted = true;
      this.prey.hp = this.prey.maxHP = cfg.huntHP;
      this.prey.alert = 0;
      this.prey.traitSpeed = 1.2;
      this.huntDestination = p;
      this.preyPing = 0;
      this.nextTrace = 0;
      this.lastPreyHP = cfg.huntHP;
      this.huntLimit = cfg.huntSeconds;
      this.huntTime = null;
      this.escorts = guards(g, p, 2, 'hunt-guard', true);
      this.hints = options;
    },
    huntStep(b, g, dt) {
      if (!this.hunting || !b.hunted || b !== this.prey) return false;
      const gap = dist(b, g.player);
      const eye = g.beasts.air.set(b.x, b.y + b.height * 0.55, b.z);
      const sight = g.beasts.line.set(g.player.x - b.x, g.player.y + 1.4 - eye.y, g.player.z - b.z);
      const sightLength = sight.length();
      b.playerVisible = false;
      if (gap < 14 && (!sightLength || level.visible(eye, sight.divideScalar(sightLength), sightLength))) {
        const view = sight.copy(eye).project(context.camera);
        b.playerVisible = view.z >= -1 && view.z <= 1 && Math.abs(view.x) <= 1 && Math.abs(view.y) <= 1;
      }
      if ((b.hp < this.lastPreyHP || gap < 7) && g.time >= (this.nextFlee ?? 0)) {
        this.nextFlee = g.time + 4;
        huntRoute.rebuild(b.x, b.z);
        const options = this.hints.filter((p) => huntRoute.dist[huntRoute.index(p.x, p.z)] >= 0);
        this.huntDestination = options.sort((a, c) => dist(c, g.player) - dist(a, g.player))[0] ?? b;
      }
      this.lastPreyHP = b.hp;
      const d = this.huntDestination;
      if (dist(b, d) > 2) {
        huntRoute.rebuild(d.x, d.z);
        const i = huntRoute.next(b.x, b.z),
          dx = huntRoute.x(i) - b.x,
          dz = huntRoute.z(i) - b.z,
          len = Math.hypot(dx, dz);
        if (len > 0.01) {
          b.fx = dx / len;
          b.fz = dz / len;
          level.move(b, b.fx * 3.2 * dt, b.fz * 3.2 * dt, 0.47);
          b.y = level.foot(b.x, b.z, b.y + 0.46, b.radius);
          b.stride = 3.2;
        }
      } else b.stride = 0;
      if (g.time >= this.nextTrace) {
        this.nextTrace = g.time + 1.4;
        const t = tracks[this.traceIndex++ % tracks.length];
        t.position.set(b.x, b.y + 0.045, b.z);
        t.rotation.y = Math.atan2(b.fx, b.fz);
        t.until = g.time + 24;
        t.visible = true;
      }
      return true;
    },
    defeated(b, g) {
      if (this.hunting && b === this.prey) {
        this.huntWon = true;
        this.huntTime = Math.floor(g.time);
        this.prey = null;
        g.journal?.complete(g, '击倒猎物');
        g.ui.notify('猎物已击倒 · 带上狩猎徽印前往撤离点', 2.5);
        g.loot.push({ name: '猎场徽印', value: 620, origin: 'hunt' });
        g.value += 620;
        for (const guard of this.escorts)
          if (guard.active && guard.fieldGroup === 'hunt-guard' && cfg.huntGuardResponse === 'rage')
            guard.traitSpeed *= 1.4;
      }
    },
    step(dt, g) {
      if (!this.enabled) return;
      for (const t of traps) {
        t.ring.visible = t.active
          ? t.hp < t.data.hp && dist(t.p, g.player) < 12
          : Math.max(t.lingering, t.flashUntil) > g.time;
        if (t.active && dist(t.p, g.player) < 20)
          t.stripe.scale.y = (t.hp < t.data.hp ? 0.33 : 0.15) + 0.045 * Math.sin(g.time * 5);
        if (t.falling) {
          t.mesh.position.y = t.p.y + 0.65 + Math.max(0, (t.falling - g.time) / 0.45) * 2.25;
          if (g.time >= t.falling) {
            t.falling = 0;
            t.mesh.visible = false;
            blastArea(g, t.p, t.data.radius, t.data.damage);
          }
        }
        if (t.lingering > g.time && g.time >= t.tick) {
          t.tick = g.time + 0.5;
          blastArea(g, t.p, t.data.radius, t.data.damage, false);
          g.effects.spray(g.beasts.air.set(t.p.x, t.p.y + .5, t.p.z), t.mesh.material.color, 5, 2.5, .08, 'mist');
        }
      }
      if (this.hunting && !this.huntWon) {
        if (g.time >= this.huntLimit) {
          g.finish(false, '猎物逃脱');
          return;
        }
        for (const t of tracks) {
          t.visible = t.until > g.time && dist(t.position, g.player) < 16;
          if (t.visible) {
            const fade = Math.min(1, (t.until - g.time) / 4);
            t.scale.set(0.18 * fade, 0.035, 0.41 * fade);
          }
        }
        if (g.time >= this.preyPing && this.prey) {
          this.preyPing = g.time + 5;
          g.sound.spatialCue(this.prey, g.player, 'step');
        }
      }
      if (this.vaultStage === 'warning' && g.time >= this.waveAt) {
        beginWave(g, 'vault', this.reinforced ? cfg.reinforcements : cfg.guards);
        this.vaultStage = 'guards';
      }
      if (this.vaultStage === 'guards') deployWave(g, 'vault');
      if (
        this.vaultStage === 'guards' &&
        !this.waitingGuards &&
        !this.guards.some((b) => b.active && b.fieldGroup === 'vault')
      ) {
        if (!this.reinforced) {
          this.reinforced = true;
          this.waveAt = g.time + 2.3;
          this.vaultStage = 'warning';
          g.ui.notify('宝库侧门正在开启 · 准备迎敌', 1.5);
        } else {
          this.vaultStage = 'clear';
          cfg.treasure.forEach((item, index) =>
            treasure(g, at(vault.center, index * 0.65, 0, -0.2), item.name, item.value, 'vault'),
          );
          g.pickups.add('health', vault.center.x + 0.6, vault.center.z, vault.center.y, '宝库医疗补给', 22);
          g.ui.notify('宝库守卫已清除', 1.5);
        }
      }
      if (this.deep === 'guards') deployWave(g, 'deep');
      if (
        this.deep === 'guards' &&
        !this.waitingGuards &&
        !this.guards.some((b) => b.active && b.fieldGroup === 'deep')
      ) {
        this.legend = treasure(g, deepRoom.center, '传奇·' + cfg.relic, 1550, 'legendary');
        this.deep = 'reward';
      }
      if (this.deep === 'reward' && this.legend && !this.legend.active) {
        this.deep = 'exit';
        exitBeacon.visible = true;
      }
    },
    guide(g) {
      if (this.deep) {
        const exit = this.deep === 'exit';
        return {
          stage: 'deep-' + this.deep,
          title: exit
            ? '携传奇宝物前往深入撤离点'
            : this.deep === 'guards'
              ? '突破深层宝库守卫'
              : '拾取传奇宝物',
          detail: exit ? '抵达后按 ' + CONFIG.interactLabel + ' 撤离' : '深入期间阵亡会失去本局全部收益',
          target: exit ? deepExit : deepRoom.center,
        };
      }
      if (this.hunting) {
        const sighted = this.prey?.playerVisible;
        return {
          stage: this.huntWon ? 'hunt-exit' : sighted ? 'hunt-sighted' : 'hunt-track',
          title: this.huntWon ? '携狩猎徽印撤离' : sighted ? '猎物已现身 · 击倒并夺取徽印' : '沿痕迹和叫声追踪猎物',
          detail: this.huntWon
            ? '前往撤离区按 ' + CONFIG.interactLabel
            : '猎物逃脱倒计时 ' + Math.max(0, Math.ceil(this.huntLimit - g.time)) + ' 秒',
          target: this.huntWon ? level.gate : sighted ? this.prey : null,
        };
      }
      return null;
    },
    hint(g) {
      if (!this.enabled) return '';
      const p = g.player;
      const use = '按 ' + CONFIG.interactLabel;
      if (this.deep === 'exit' && near(p, deepExit)) return use + ' 从深层出口撤离';
      if (deepExit && !this.deep && g.nearGate() && g.ready())
        return this.confirmUntil > g.time
          ? '再次按 ' + CONFIG.deepKey + ' 确认深入 · 阵亡失去全部战利品'
          : use + ' 撤离，或按 ' + CONFIG.deepKey + ' 深入争夺传奇宝物';
      if (!this.switchUsed && near(p, lever))
        return (
          use +
          ' ' +
          cfg.switchName +
          ' · 打开宝库后门，限一次' +
          (cfg.mechanism === 1 ? ' · 当心四米冲击区' : cfg.mechanism === 2 ? ' · 当心蒸汽区' : '')
        );
      if (near(p, device) && g.beasts.boss?.active)
        return this.deviceAt > g.time ? '场地机关冷却中' : use + ' 释放场地脉冲 · 范围七米，注意避开中心';
      if (secret && !this.secretOpen && near(p, secret.front, 1.8))
        return '墙板后有回声 · ' + use + ' 查看异色接缝';
      if (vault && this.vaultStage === 'idle' && near(p, vault.front, 4))
        return '可选 · ' + use + ' 闯入' + cfg.name + '，守卫有两波，后门机关可开捷径';
      return '';
    },
    deepen(g) {
      if (!this.enabled || !deepExit || this.deep || !g.ready() || !g.nearGate()) return;
      if (!(this.confirmUntil > g.time)) {
        this.confirmUntil = g.time + 5;
        g.ui.notify('再次确认深入 · 阵亡会失去本局全部战利品', 3);
        return;
      }
      this.deep = 'guards';
      this.deepAt = g.time;
      this.vaultStage = 'deep';
      open(deepRoom.door, false);
      beginWave(g, 'deep', cfg.deepGuards);
      g.pickups.deepSupplies = true;
      for (const item of g.pickups.objects)
        if (item.active && ['health', 'ammo', 'grenade', 'sample'].includes(item.kind)) item.active = false;
      g.pickups.add('ammo', deepRoom.front.x, deepRoom.front.z, deepRoom.front.y, '深入配给', 30, true);
      g.journal?.mark(g, '选择深入');
      g.ui.notify('原撤离点已关闭 · 突破深层宝库', 2);
    },
    interact(g) {
      if (!this.enabled) return false;
      const p = g.player;
      if (this.deep === 'exit' && near(p, deepExit)) {
        this.deepFinished = true;
        g.journal?.complete(g, '携传奇宝物深入撤离');
        g.finish(true, '携传奇宝物深入撤离');
        return true;
      }
      if (this.deep && g.nearGate()) {
        g.ui.notify('原撤离点已关闭', 1);
        return true;
      }
      if (near(p, lever) && !this.switchUsed) {
        this.switchUsed = true;
        handle.rotation.z = 0.6;
        open(vault.shortcut, false);
        if (cfg.mechanism === 1) blastArea(g, vault.back, 4.3, 32);
        if (cfg.mechanism === 2) g.projectiles.pool(vault.back.x, vault.back.y, vault.back.z, 2);
        g.sound.tone(360, 165, 0.32, 0.2);
        g.ui.notify('宝库后门已开放', 1.5);
        return true;
      }
      if (near(p, device) && g.beasts.boss?.active && g.time >= this.deviceAt) {
        this.deviceAt = g.time + 18;
        const b = g.beasts.boss;
        if (dist(b, device) < 8) breakBoss(b, g);
        blastArea(g, device, 7, 46);
        g.ui.notify('场地机关已释放 · 冷却十八秒', 1.5);
        return true;
      }
      if (secret && !this.secretOpen && near(p, secret.front, 1.8)) {
        this.secretOpen = true;
        open(secret.door, false);
        g.ui.notify('发现秘闻 · ' + cfg.lore, 5);
        const token = runNumber;
        const award = (claimed) => {
          if (token !== runNumber || g.phase === 'fail' || g.phase === 'win') return;
          if (!claimed) treasure(g, secret.center, '秘藏·' + cfg.relic, cfg.value, 'secret');
          else g.pickups.add('ammo', secret.center.x, secret.center.z, secret.center.y, '密室补给', 24);
        };
        if (campaign)
          campaign
            .discover()
            .then((r) => award(r.claimed))
            .catch(() => award(false));
        else award(false);
        return true;
      }
      if (vault && this.vaultStage === 'idle' && near(p, vault.front, 4)) {
        this.reinforced = false;
        this.vaultStage = 'warning';
        this.waveAt = g.time + 1.5;
        g.ui.notify('宝库侧门警报 · 守卫即将抵达', 1.5);
        return true;
      }
      return false;
    },
    ray(origin, dir, limit) {
      let found = null;
      if (this.enabled)
        for (const t of traps) {
          if (!t.active) continue;
          const distance = rayBox(origin, dir, t.box);
          if (distance < limit) {
            limit = distance;
            found = t;
          }
        }
      return found ? { trap: found, distance: limit } : null;
    },
    hit(t, damage, g) {
      if (!t.active) return;
      t.hp -= damage;
      g.effects.spray(g.beasts.air.copy(t.mesh.position), g.beasts.bossTint, 6, 2, 0.06, 'spark');
      if (t.hp <= 0) releaseTrap(t, g);
      else {
        t.stripe.scale.y = 0.35;
        g.ui.notify(t.data.name + '不稳定 · 离开危险半径', 1);
      }
    },
    minimap(ctx, px, pz, g) {
      if (!this.enabled) return;
      if (vault) {
        ctx.strokeStyle = '#edba67';
        ctx.strokeRect(px(vault.center.x) - 3, pz(vault.center.z) - 3, 6, 6);
      }
      if (lever && !this.switchUsed) {
        ctx.fillStyle = '#68ecd3';
        ctx.fillRect(px(lever.x) - 1.5, pz(lever.z) - 1.5, 3, 3);
      }
      if (this.deep) {
        const p = this.deep === 'exit' ? deepExit : deepRoom.center;
        ctx.strokeStyle = '#d999f7';
        ctx.strokeRect(px(p.x) - 3, pz(p.z) - 3, 6, 6);
      }
      if (this.hunting && this.prey) {
        const p = this.prey;
        ctx.strokeStyle = '#efb981';
        ctx.beginPath();
        ctx.arc(px(Math.round(p.x / 10) * 10), pz(Math.round(p.z / 10) * 10), 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  };
  return field;
}
