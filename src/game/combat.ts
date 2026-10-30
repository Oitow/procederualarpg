import { CanvasTexture, Scene, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Equipment } from './inventory';
import { createRat, createSpider, type Monster } from './monsters';
import type { Terrain, World } from './world';

const HERO_R = 0.35;
const MELEE = 1.6;
const WAVE_EVERY = 5;
const WAVE_SIZE = 5;
const CAP = 25;
const HERO_MAX_HP = 100;
const REGEN = 2;

export interface CombatFrame {
  /** 0..1 progress of the attack swing, or -1 */
  attackU: number;
  /** angle the hero should face while attacking, or null */
  face: number | null;
  respawn: boolean;
}

interface Floater { s: Sprite; life: number; vy: number }

const texCache = new Map<string, CanvasTexture>();
function numTex(text: string, color: string): CanvasTexture {
  const key = text + color;
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 48;
    const g = c.getContext('2d')!;
    g.font = '700 36px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = '#000';
    g.strokeText(text, 64, 26);
    g.fillStyle = color;
    g.fillText(text, 64, 26);
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

export class Combat {
  hp = HERO_MAX_HP;
  readonly maxHp = HERO_MAX_HP;
  kills = 0;
  wave = 0;
  dead = false;
  onHeroHit: () => void = () => {};
  readonly monsters: Monster[] = [];
  private deadT = 0;
  private waveT = WAVE_EVERY - 1.5;
  private atkCd = 0;
  private atkT = -1;
  private atkDur = 0.7;
  private atkHit = false;
  private target: Monster | null = null;
  private floaters: Floater[] = [];
  private pool: Sprite[] = [];
  private spawnSeed = 1;
  private fix = { x: 0, z: 0, hit: false };

  constructor(
    private scene: Scene,
    private world: World,
    private terrain: Terrain,
    private equipment: () => Equipment,
  ) {}

  get alive() {
    return this.monsters.reduce((n, m) => n + (m.dying < 0 ? 1 : 0), 0);
  }

  private weaponDamage(): { dmg: number; interval: number } {
    const w = this.equipment().weapon;
    const lo = w?.stats.damageMin ?? 2;
    const hi = w?.stats.damageMax ?? 4;
    const speed = w?.stats.speed ?? 1;
    const dmg = lo + Math.random() * (hi - lo);
    return { dmg: Math.max(1, Math.round(dmg)), interval: 1 / Math.max(0.5, speed) };
  }

  private armor(): number {
    return Object.values(this.equipment()).reduce((a, i) => a + (i?.stats.armor ?? 0), 0);
  }

  private floatText(x: number, y: number, z: number, text: string, color: string) {
    const s = this.pool.pop() ?? Object.assign(new Sprite(new SpriteMaterial({ depthTest: false, transparent: true })), { renderOrder: 20 });
    (s.material as SpriteMaterial).map = numTex(text, color);
    (s.material as SpriteMaterial).opacity = 1;
    (s.material as SpriteMaterial).needsUpdate = true;
    s.scale.set(1.1, 0.41, 1);
    s.position.set(x + (Math.random() - 0.5) * 0.4, y, z);
    this.scene.add(s);
    this.floaters.push({ s, life: 0.9, vy: 1.8 });
  }

  private spawnWave(hero: Vector3) {
    const n = Math.min(WAVE_SIZE + Math.floor(this.wave / 5), CAP - this.alive);
    if (n <= 0) return;
    this.wave++;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 10; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 6;
        const p = this.world.resolve(hero.x + Math.cos(a) * r, hero.z + Math.sin(a) * r, 0.5);
        if (!this.terrain.isWalkable(p.x, p.z)) continue;
        const seed = this.spawnSeed++ * 7919 + this.terrain.seed;
        const m = Math.random() < 0.45 ? createSpider(seed) : createRat(seed);
        const k = 1 + 0.07 * (this.wave - 1);
        m.hp = m.maxHp = Math.round(m.maxHp * k);
        m.damage = Math.round(m.damage * (1 + 0.04 * (this.wave - 1)));
        m.root.position.set(p.x, this.terrain.height(p.x, p.z), p.z);
        m.heading = Math.atan2(hero.x - p.x, hero.z - p.z);
        this.scene.add(m.root);
        this.monsters.push(m);
        break;
      }
    }
  }

  private damageMonster(m: Monster, dmg: number, from: Vector3) {
    m.hp -= dmg;
    m.flashT = 0.09;
    const p = m.root.position;
    this.floatText(p.x, p.y + 0.9 * m.size + 0.4, p.z, String(dmg), '#ffe9a8');
    const dx = p.x - from.x, dz = p.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    p.x += (dx / d) * 0.12;
    p.z += (dz / d) * 0.12;
    if (m.hp <= 0 && m.dying < 0) {
      m.dying = 0;
      this.kills++;
    }
  }

  update(dt: number, hero: Vector3, moving: boolean): CombatFrame {
    const frame: CombatFrame = { attackU: -1, face: null, respawn: false };

    // floating numbers
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.s.position.y += f.vy * dt;
      (f.s.material as SpriteMaterial).opacity = Math.min(1, f.life * 3);
      if (f.life <= 0) {
        this.scene.remove(f.s);
        this.pool.push(f.s);
        this.floaters.splice(i, 1);
      }
    }
    if (dt <= 0) return frame;

    // hero life cycle
    if (this.dead) {
      this.deadT += dt;
      if (this.deadT >= 2) {
        this.dead = false;
        this.hp = this.maxHp;
        frame.respawn = true;
        this.atkT = -1;
        this.atkCd = 0.5;
      }
    } else this.hp = Math.min(this.maxHp, this.hp + REGEN * dt);

    // waves
    if (!this.dead) {
      this.waveT += dt;
      if (this.waveT >= WAVE_EVERY) {
        this.waveT = 0;
        this.spawnWave(hero);
      }
    }

    // hero auto-attack
    if (!this.dead) {
      this.atkCd -= dt;
      if (this.atkT < 0 && this.atkCd <= 0) {
        const t = this.nearest(hero, MELEE);
        if (t) {
          const { interval } = this.weaponDamage();
          this.target = t;
          this.atkT = 0;
          this.atkHit = false;
          this.atkCd = interval;
          this.atkDur = Math.min(0.75, interval * 0.85);
        }
      }
      if (this.atkT >= 0) {
        this.atkT += dt;
        const tp = this.target?.root.position;
        if (tp && this.target!.dying < 0) frame.face = Math.atan2(tp.x - hero.x, tp.z - hero.z);
        if (!this.atkHit && this.atkT >= this.atkDur * 0.45) {
          this.atkHit = true;
          let t = this.target && this.target.dying < 0 && this.dist(hero, this.target) <= MELEE * 1.3 ? this.target : this.nearest(hero, MELEE * 1.3);
          if (t) this.damageMonster(t, this.weaponDamage().dmg, hero);
          else t = null;
        }
        if (this.atkT >= this.atkDur) this.atkT = -1;
        else frame.attackU = this.atkT / this.atkDur;
      }
    }

    // monsters
    const armor = this.armor();
    const reduce = 1 - armor / (armor + 80);
    const list = this.monsters;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      const p = m.root.position;
      if (m.dying >= 0) {
        m.dying += dt;
        const k = Math.max(0, 1 - m.dying / 0.7);
        m.root.rotation.z = Math.min(1, m.dying * 4) * 2.4;
        m.root.scale.setScalar(Math.max(0.01, k));
        if (m.dying >= 0.7) {
          this.scene.remove(m.root);
          list.splice(i, 1);
        }
        continue;
      }
      if (m.flashT > 0) {
        m.flashT -= dt;
        m.setFlash(m.flashT > 0);
      }
      const dx = hero.x - p.x, dz = hero.z - p.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const reach = m.radius + HERO_R + 0.1;
      let vx = 0, vz = 0;
      if (dist > reach || this.dead) {
        const sp = this.dead ? 0 : m.speed;
        vx = (dx / dist) * sp;
        vz = (dz / dist) * sp;
      }
      // separation
      for (const o of list) {
        if (o === m || o.dying >= 0) continue;
        const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z;
        const min = (m.radius + o.radius) * 1.15;
        const d2 = ox * ox + oz * oz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / min;
          vx += (ox / d) * push * 3;
          vz += (oz / d) * push * 3;
        }
      }
      const nx = p.x + vx * dt, nz = p.z + vz * dt;
      const r = this.world.resolve(nx, nz, m.radius * 0.8, this.fix);
      const ox = p.x, oz = p.z;
      if (this.terrain.isWalkable(r.x, r.z)) {
        p.x = r.x;
        p.z = r.z;
      }
      const spd = Math.hypot(p.x - ox, p.z - oz) / dt;
      p.y = this.terrain.height(p.x, p.z);
      const want = spd > 0.3 ? Math.atan2(p.x - ox, p.z - oz) : Math.atan2(dx, dz);
      let dh = want - m.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      m.heading += dh * Math.min(1, dt * 10);

      // contact damage
      m.attackCd -= dt;
      if (!this.dead && dist <= reach + 0.2 && m.attackCd <= 0) {
        m.attackCd = m.attackInterval;
        const dmg = Math.max(1, Math.round(m.damage * reduce));
        this.hp -= dmg;
        this.floatText(hero.x, hero.y + 2.1, hero.z, String(dmg), '#ff6a55');
        this.onHeroHit();
        if (this.hp <= 0) {
          this.hp = 0;
          this.dead = true;
          this.deadT = 0;
          this.atkT = -1;
        }
      }
      m.update(dt, spd, m.heading, this.terrain.height);
    }

    // after respawn clear a safe zone around the hero
    if (frame.respawn)
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (this.dist(hero, m) < 9) {
          this.scene.remove(m.root);
          list.splice(i, 1);
        }
      }
    void moving;
    return frame;
  }

  private dist(a: Vector3, m: Monster) {
    return Math.hypot(a.x - m.root.position.x, a.z - m.root.position.z);
  }

  private nearest(hero: Vector3, range: number): Monster | null {
    let best: Monster | null = null;
    let bd = Infinity;
    for (const m of this.monsters) {
      if (m.dying >= 0) continue;
      const d = this.dist(hero, m);
      if (d - m.radius * 0.5 <= range && d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }
}
