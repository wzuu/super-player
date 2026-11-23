// 职能和精英修饰既有原型，同一实体沿用原来的移动、命中盒和死亡确认。
export const roleRules = {
  volatile: { title: '自爆体', stage: 2, type: 0, hp: .66, speed: 1.28, radius: 3.8, fuse: 1.35 },
  shield: { title: '护盾体', stage: 5, type: 1, hp: .77, speed: .67, radius: 4, charge: 105 },
  brood: { title: '孵化体', stage: 8, type: 2, hp: 1.1, speed: .83, radius: 5, interval: 9, windup: 1.65, limit: 3 },
};
export const affixTitles = { swift: '疾行', thorn: '荆棘', split: '分裂', trail: '燃迹', armor: '厚甲' };
const affixes = Object.keys(affixTitles);
const has = (b, trait) => b.affixes?.includes(trait);
const gap = (a,b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);

export function blastArea(game, center, radius, damage, source = 'environment', ignore = null) {
  const { x,y,z } = center, {beasts,level,player} = game;
  const candidates = beasts.hash.query(x-radius,z-radius,x+radius,z+radius,[]);
  function visible(target) {
    const origin = beasts.air.set(x,y+.5,z), ray = beasts.line.set(target.x-x,target.y+.6-origin.y,target.z-z);
    const distance = ray.length();
    return distance <= radius && (!distance || level.visible(origin, ray.divideScalar(distance), distance));
  }
  for (const target of candidates) {
    if (!target.active || target === ignore || !visible(target)) continue;
    const distance = Math.max(.1, Math.hypot(target.x-x,target.z-z));
    target.perkPushX = 5*(target.x-x)/distance; target.perkPushZ = 5*(target.z-z)/distance;
    target.knockX = target.perkPushX; target.knockZ = target.perkPushZ;
    beasts.damage(target, damage, game, source);
  }
  if (visible(player)) player.hurt(damage * .3, game, undefined, center);
}

export class FoeTraits {
  constructor(stage, config) {
    this.stage = stage;
    this.config = config;
    this.available = Object.keys(roleRules).filter(key => stage >= roleRules[key].stage);
    this.splits = [];
  }
  assign(beast, game, forcedElite = false) {
    if (!beast || beast.type === 3 || !this.stage) return;
    const role = this.available.find(key => roleRules[key].type === beast.type);
    if (role && Math.random() < .13) {
      beast.role = role;
      beast.hp *= roleRules[role].hp;
      beast.shield = roleRules[role].charge ?? 0;
    }
    const boss = game.beasts.boss;
    const bossFight = boss?.active && (boss.fight?.started || gap(boss, game.player) < 23);
    const odds = (.012 + this.stage * .0028) * this.config.player.incoming;
    if (!bossFight && (forcedElite || Math.random() < odds)) {
      const choices = affixes.filter(id => !(id === 'swift' && beast.role === 'volatile'));
      beast.affixes = [choices.splice(Math.floor(Math.random()*choices.length),1)[0]];
      if (this.stage >= 10 && Math.random() < .24)
        beast.affixes.push(choices[Math.floor(Math.random()*choices.length)]);
      const scale = 1.25;
      if (!game.level.blocked(beast.x,beast.z,beast.y,beast.radius*scale,beast.height*scale)) {
        beast.scale = scale; beast.radius *= scale; beast.height *= scale;
      }
      beast.hp *= 1.85;
    }
    beast.maxHP = beast.hp;
    beast.traitSpeed = (roleRules[beast.role]?.speed ?? 1) * (has(beast,'swift') ? 1.32 : 1);
  }
  damage(beast, amount, game, source, hit) {
    if (beast.type === 3 || source === 'detonation') return amount;
    const { x,z } = beast, radius = roleRules.shield.radius;
    if (beast.role !== 'shield') {
      const nearby = game.beasts.hash.query(x-radius,z-radius,x+radius,z+radius,[]);
      const shield = nearby.find(b => b.active && b.role === 'shield' && b.shield > 0 && gap(b,beast) <= radius);
      if (shield) {
        const blocked = Math.min(amount,shield.shield); shield.shield -= blocked; amount -= blocked;
        shield.flash = .12;
        if (!shield.shield) { game.ui.notify('护盾核心已破碎',1); game.sound.tone(760,220,.14,.13); }
      }
    } else if (hit?.headshot && beast.shield > 0) {
      beast.shield = Math.max(0,beast.shield - amount * 2);
      if (!beast.shield) game.ui.notify('护盾核心已破碎',1);
    }
    if (beast.role === 'brood' && beast.charging && amount > 0) {
      beast.charging = false; beast.traitAt = game.time + roleRules.brood.interval;
    }
    if (source === 'weapon' || source === 'electric') {
      const p = game.player;
      if (has(beast,'thorn') && gap(beast,p) < 4) p.hurt(Math.min(6,amount*.1),game,undefined,beast);
      if (has(beast,'armor')) amount *= (p.x-x)*beast.fx+(p.z-z)*beast.fz > 0 ? .46 : 1.35;
    }
    return amount;
  }
  offspring(parent,game,count) {
    const {beasts,level} = game;
    if (parent.storyWave) {
      const active=beasts.pool.filter(b=>b.active && b.storyWave).length;
      count=Math.min(count,Math.max(0,Math.min(parent.storyWave.cap,game.story.cap)-active));
    }
    if (['vault','deep'].includes(parent.fieldGroup)) {
      const active=beasts.pool.filter(b=>b.active && b.fieldGroup===parent.fieldGroup).length;
      count=Math.min(count,Math.max(0,game.field.guardCount-active));
    }
    for (let i=0; i<8 && count>0 && beasts.live<Math.min(this.config.beasts.population+8,beasts.pool.length); i++) {
      const a=i*Math.PI/4, x=parent.x+Math.sin(a)*1.65,z=parent.z+Math.cos(a)*1.65;
      const floor=level.surface(x,z,parent.y+.42);
      if (Math.abs(floor-parent.y)>.65 || gap({x,y:floor,z},game.player)<1.5) continue;
      const child=beasts.spawn(0,x,z,floor);
      if (child) {
        child.alert=5;child.storyWave=parent.storyWave ?? null;child.fieldGroup=parent.fieldGroup ?? null;
        if (['vault','deep'].includes(child.fieldGroup)) game.field.guards.push(child);
        count--;
      }
    }
  }
  step(b,g,dt) {
    if (has(b,'swift')) b.cooldown -= dt*.30;
    if (has(b,'trail') && g.time >= b.trailAt && b.stride>.8) {
      b.trailAt=g.time+1.15;
      g.projectiles.pool(b.x,b.y,b.z,2.7);
    }
    if (b.role === 'volatile') {
      if (!b.charging && gap(b,g.player)<roleRules.volatile.radius*.85 && b.playerVisible) {
        b.charging=true; b.traitAt=g.time+roleRules.volatile.fuse;
        g.sound.tone(360,820,.27,.18); b.alert=5;
      }
      if (b.charging && g.time>=b.traitAt) {
        // 先移除自身再广播范围伤害，连锁死亡不会重复引爆。
        const position={x:b.x,y:b.y,z:b.z};
        g.beasts.damage(b,b.maxHP*10,g,'detonation');
        if (!b.active) blastArea(g,position,roleRules.volatile.radius,70);
      }
    }
    if (b.role === 'brood' && b.broods < roleRules.brood.limit && b.playerVisible && g.time>=b.traitAt) {
      const rules=roleRules.brood;
      if (!b.charging) {
        b.charging=true; b.traitAt=g.time+rules.windup; g.sound.tone(280,560,.37,.12);
      } else {
        b.charging=false; b.broods++; b.traitAt=g.time+rules.interval;
        const nearby=g.beasts.hash.query(b.x-rules.radius,b.z-rules.radius,b.x+rules.radius,b.z+rules.radius,[]);
        const hurt=nearby.find(n=>n.active && n.type!==3 && n.hp<n.maxHP && gap(n,b)<=rules.radius);
        if (hurt) { hurt.hp=Math.min(hurt.maxHP,hurt.hp+28); hurt.flash=.09; }
        else this.offspring(b,g,1);
      }
    }
  }
  defeated(b,game) {
    if (!b.affixes?.length) return;
    const y=game.beasts.dropHeight(b);
    game.pickups.add('ammo',b.x,b.z,y,'精英补给',30);
    const roll=Math.random();
    if (roll < .08) game.pickups.add('rare',b.x+.33,b.z,y,'精英改装材料·穿透弹芯',520);
    else if (roll < .82) game.pickups.add('rare',b.x+.33,b.z,y,'精英徽记',240+this.stage*8);
    if (has(b,'split')) this.splits.push({x:b.x,y:b.y,z:b.z,storyWave:b.storyWave,fieldGroup:b.fieldGroup});
  }
}
