// Renders IdleSim NPCs with their Blender GLBs and maps activity -> clip.
// The sim runs on a fixed 0.1 s step; rendering interpolates positions.
import { gymMount } from './gym-pose';
import { t } from '../i18n';
import * as THREE from 'three';
import { labelClear, type LabelBlocker } from './label-visibility';
import { IdleSim, type NpcState } from '../sim/idle';
import type { NavGrid } from '../world/navgrid';
import { toThree } from '../world/build';
import type { FloorId, World } from '../world/types';
import { Avatar } from './avatar';

export const ACTIVITY_LABEL: Record<string, string> = {
  desk: 'di meja kerja', coffee: 'bikin kopi', chat: 'ngobrol', read: 'membaca', stretch: 'peregangan', game: 'main game',
  billiards: 'main biliar', exercise: 'olahraga', rest: 'istirahat', walk: 'berjalan', idle: 'santai', talk: 'bicara dengan CEO',
};

export const WORK_LABEL: Record<string, string> = { working: 'bekerja', waiting: 'menunggu keputusanmu' };

const STEP = 0.1;
// Personas further than this from the CEO (plan metres) render their LOD1
// mesh: at the default 3/4 camera they cover a few dozen pixels there.
export const LOD1_DISTANCE = 8;
export const LOD_HYSTERESIS = 1;


interface Hit { age: number; reducedMotion: boolean; stars: THREE.Group; mats: THREE.Material[]; tex: THREE.Texture | null; bubble: HTMLElement | null }

const easeOutBackSmall = (x: number) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;

/** Five-point cartoon star on a canvas (reprimand reaction). */
function makeStarTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 12 : 28;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    g.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#7a4a10';
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.fill();
  g.stroke();
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface View { avatar: Avatar; prev: THREE.Vector3; next: THREE.Vector3; label: HTMLElement; floor: FloorId }

export class NpcLayer {
  readonly sim: IdleSim;
  readonly group = new THREE.Group();
  private views = new Map<string, View>();
  private acc = 0;

  constructor(private world: World, nav: Record<FloorId, NavGrid>, seed: number, labelHost: HTMLElement) {
    // ELSI: simulation clock follows the real Asia/Jakarta clock (1 sim minute per real minute),
    // so the office day matches WIB instead of the original accelerated 08:45 start.
    const wibParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    const wibHour = Number(wibParts.find((x) => x.type === 'hour')!.value);
    const wibMinute = Number(wibParts.find((x) => x.type === 'minute')!.value);
    this.sim = new IdleSim(world, nav, { seed, startHour: wibHour + wibMinute / 60, minutesPerSecond: 1 / 60 });
    this.group.name = 'npcs';
    // Own layer: room labels are rebuilt on floor change and must not wipe these.
    const host = document.createElement('div');
    host.className = 'labels npc-labels';
    host.setAttribute('aria-hidden', 'true');
    labelHost.after(host);
    this.labelHost = host;
    for (const npc of this.sim.npcs) {
      const actor = world.actors.find((a) => a.id === npc.id)!;
      const avatar = new Avatar(npc.name, 0x6f8fa6);
      void avatar.load(`assets/characters/${actor.avatarAsset.toLowerCase()}.glb`);
      const p = this.worldPos(npc);
      avatar.root.position.copy(p);
      const label = document.createElement('div');
      label.className = 'npc-label';
      label.setAttribute('aria-hidden', 'true');
      host.append(label);
      this.views.set(npc.id, { avatar, prev: p.clone(), next: p.clone(), label, floor: npc.floor });
      this.group.add(avatar.root);
    }
  }

  private gymCache = new Map<string, ReturnType<typeof gymMount>>();
  private gymFor(fixtureId: string) {
    if (!this.gymCache.has(fixtureId)) this.gymCache.set(fixtureId, gymMount(this.world.fixtures.find((f) => f.id === fixtureId)));
    return this.gymCache.get(fixtureId)!;
  }

  private worldPos(npc: NpcState): THREE.Vector3 {
    const elev = this.world.floors.find((f) => f.id === npc.floor)!.elevation;
    let [x, y] = npc.pos;
    if (npc.phase === 'perform' && npc.slot) {
      // Seated activities sit on the chair itself, not on the approach cell.
      const slot = this.world.activitySlots.find((s) => s.id === npc.slot)!;
      // Gym machines: on the belt / on the saddle, not beside the machine.
      const gym = this.gymFor(slot.fixture);
      if (gym) return toThree(gym.pos[0], gym.pos[1], elev + gym.lift);
      if (slot.pose === 'sit') [x, y] = slot.pos;
    }
    return toThree(x, y, elev);
  }

  /** Reaction overlays after a reprimand: clip name until sim time. */
  private reactions = new Map<string, { clip: string; until: number }[]>();
  /** Per-persona slapstick overlay: squash, hop, orbiting stars, speech bubble. */
  private hits = new Map<string, Hit>();
  private labelHost: HTMLElement | null = null;

  /** Head height above the feet (m) for the reprimand effect. */
  static readonly HEAD_Y = 1.72;

  /** Persona head in world space (reprimand target). */
  headOf(id: string): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v) return null;
    const p = v.avatar.root.position.clone();
    const head = v.avatar.model?.getObjectByName('head');
    if (head) { v.avatar.root.updateWorldMatrix(true, true); return head.getWorldPosition(p).add(new THREE.Vector3(0, 0.12, 0)); }
    return p.add(new THREE.Vector3(0, NpcLayer.HEAD_Y, 0));
  }

  /**
   * Cartoon reaction (REQ-TEGUR-02): squash on contact, a surprised hop,
   * stars orbiting the head and fading, a rub of the head and one line in a
   * speech bubble; the caller then sends the persona running to its desk.
   * Clips missing from older GLBs fall back to wave/talk, so it still reads.
   * Reduced motion: no squash, hop or orbit; the bubble and a still star ring
   * remain. No blood, bruises or fainting: cartoon only.
   */
  react(id: string, reducedMotion: boolean, line = ''): void {
    const now = this.sim.time;
    const v = this.views.get(id);
    if (!v) return;
    const has = (c: string) => v.avatar.has(c);
    this.reactions.set(id, [
      { clip: has('surprised') ? 'surprised' : 'wave', until: now + 0.7 },
      { clip: has('rub_head') ? 'rub_head' : 'talk', until: now + 2.0 },
    ]);
    this.clearHit(id);
    const stars = new THREE.Group();
    stars.name = 'scold-stars';
    const tex = makeStarTexture();
    const mats: THREE.Material[] = [];
    for (let i = 0; i < 5; i++) {
      const mat = tex ? new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }) : new THREE.SpriteMaterial({ color: 0xffd23f, transparent: true, depthWrite: false });
      mats.push(mat);
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.17);
      stars.add(s);
    }
    stars.position.y = NpcLayer.HEAD_Y + 0.28;
    v.avatar.root.add(stars);
    let bubble: HTMLElement | null = null;
    if (line && this.labelHost) {
      bubble = document.createElement('div');
      bubble.className = 'npc-bubble';
      bubble.textContent = line;
      Object.assign(bubble.style, {
        position: 'absolute', left: '0', top: '0', pointerEvents: 'none', maxWidth: '15rem', zIndex: '3',
        background: '#fffaf0', color: '#2b2118', border: '2px solid #2b2118', borderRadius: '14px',
        padding: '6px 10px', font: '700 0.9rem/1.25 system-ui, sans-serif', boxShadow: '3px 3px 0 rgba(43,33,24,0.35)',
        opacity: '0', transformOrigin: '50% 100%',
      } satisfies Partial<CSSStyleDeclaration>);
      const tail = document.createElement('span');
      Object.assign(tail.style, {
        position: 'absolute', left: '50%', bottom: '-9px', width: '14px', height: '14px', marginLeft: '-7px',
        background: '#fffaf0', borderRight: '2px solid #2b2118', borderBottom: '2px solid #2b2118', transform: 'rotate(45deg)',
      } satisfies Partial<CSSStyleDeclaration>);
      bubble.append(tail);
      this.labelHost.append(bubble);
    }
    this.hits.set(id, { age: 0, reducedMotion, stars, mats, tex, bubble });
  }

  /** Is a slapstick overlay still running for this persona (tests)? */
  reacting(id: string): boolean { return this.hits.has(id); }

  private clearHit(id: string) {
    const h = this.hits.get(id);
    if (!h) return;
    h.stars.removeFromParent();
    for (const m of h.mats) m.dispose();
    h.tex?.dispose();
    h.bubble?.remove();
    const v = this.views.get(id);
    if (v) v.avatar.root.scale.set(1, 1, 1);
    this.hits.delete(id);
  }

  /** Squash, hop, star orbit and bubble, after the base pose for this frame. */
  private updateHit(id: string, v: View, dt: number, camera: THREE.Camera, w: number, h: number) {
    const hit = this.hits.get(id);
    if (!hit) return;
    hit.age += dt;
    const a = hit.age;
    const rm = hit.reducedMotion;
    const root = v.avatar.root;
    if (!rm) {
      // Squash on contact, then an elastic wobble back to shape.
      const sq = a < 0.06 ? a / 0.06 : Math.exp(-(a - 0.06) * 7) * Math.cos((a - 0.06) * 22);
      const sy = 1 - 0.32 * sq;
      root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      // Surprised hop right after the squash.
      if (a > 0.12 && a < 0.5) root.position.y += Math.sin(((a - 0.12) / 0.38) * Math.PI) * 0.22;
    } else root.scale.set(1, 1, 1);
    // Stars: orbit the head with a little bob and spin, fade out at the end.
    const fade = a < 1.6 ? 1 : Math.max(0, 1 - (a - 1.6) / 0.7);
    hit.stars.children.forEach((s, i) => {
      const ang = (i / 5) * Math.PI * 2 + (rm ? 0 : a * 5.5);
      const r = 0.3 + (rm ? 0 : 0.03 * Math.sin(a * 9 + i));
      s.position.set(Math.cos(ang) * r, rm ? 0 : Math.sin(a * 7 + i * 1.3) * 0.05, Math.sin(ang) * r);
      const m = (s as THREE.Sprite).material;
      m.opacity = fade;
      if (!rm) m.rotation = a * 6 + i;
      const pop = rm ? 1 : Math.min(1, a / 0.15);
      s.scale.setScalar(0.17 * pop);
    });
    // Speech bubble over the head (pops in after the hit, gone by 3.4 s).
    const b = hit.bubble;
    if (b) {
      const p = root.position.clone().add(new THREE.Vector3(0, 2.25, 0)).project(camera);
      const on = root.visible && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
      const k = a < 0.25 ? 0 : a < 0.4 ? (a - 0.25) / 0.15 : a < 3.1 ? 1 : Math.max(0, 1 - (a - 3.1) / 0.3);
      const s = rm ? 1 : k < 1 && a < 0.4 ? 0.6 + 0.4 * easeOutBackSmall(k) : 1;
      b.style.opacity = on ? String(k) : '0';
      b.style.transform = `translate(-50%, -100%) translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) scale(${s.toFixed(3)})`;
    }
    if (a > 3.5) this.clearHit(id);
  }

  /** Reaction clip right now, if any (tests read it through clipFor). */
  private reactionClip(npc: NpcState): string | null {
    const list = this.reactions.get(npc.id);
    if (!list) return null;
    while (list.length && list[0].until <= this.sim.time) list.shift();
    if (!list.length) { this.reactions.delete(npc.id); return null; }
    return list[0].clip;
  }

  clipFor(npc: NpcState): string {
    const r = this.reactionClip(npc);
    if (r) return r;
    if ((npc.phase === 'travel' || npc.phase === 'recover') && (npc.scoldedUntil ?? 0) > this.sim.time) {
      return this.views.get(npc.id)?.avatar.has('flee') ? 'flee' : 'run';
    }
    if (npc.phase === 'travel' || npc.phase === 'recover') return 'walk';
    if (npc.phase === 'paused') return 'talk';
    if (npc.phase !== 'perform') return 'idle';
    if (npc.workStatus === 'working' && npc.activity === 'idle') return 'type';
    const slot = npc.slot ? this.world.activitySlots.find((s) => s.id === npc.slot) : undefined;
    const sit = slot?.pose === 'sit';
    const gym = slot ? this.gymFor(slot.fixture) : null;
    if (gym && npc.activity === 'exercise') {
      const v = this.views.get(npc.id);
      return !v || v.avatar.has(gym.clip) ? gym.clip : sit ? 'sit' : 'exercise';
    }
    switch (npc.activity) {
      case 'desk': return 'type';
      case 'coffee': return 'coffee';
      case 'chat': return sit ? 'sit' : 'talk';
      case 'read': return sit ? 'sit' : 'read';
      case 'rest': return 'sit';
      case 'game': return sit ? 'game' : 'talk';
      default: return npc.activity;
    }
  }

  update(dt: number, playerFloor: FloorId, camera: THREE.Camera, w: number, h: number, reducedMotion: boolean, playerPos?: [number, number], labelBlockers: LabelBlocker[] = []): void {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      for (const v of this.views.values()) v.prev.copy(v.next);
      this.sim.step(STEP);
      for (const npc of this.sim.npcs) {
        const v = this.views.get(npc.id)!;
        const p = this.worldPos(npc);
        // Floor change or sit snap: no interpolation across the jump.
        if (v.floor !== npc.floor || p.distanceTo(v.next) > 1.5) v.prev.copy(p);
        v.next.copy(p);
        v.floor = npc.floor;
      }
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0; // drop backlog after a long stall instead of fast-forwarding
    const alpha = this.acc / STEP;
    for (const npc of this.sim.npcs) {
      const v = this.views.get(npc.id)!;
      const visible = npc.floor === playerFloor;
      v.avatar.root.visible = visible;
      v.avatar.root.position.lerpVectors(v.prev, v.next, alpha);
      v.avatar.setFacing(npc.facing);
      if (playerPos) {
        // Hysteresis band: an NPC walking along the LOD radius used to swap
        // meshes every frame, which read as the model flashing.
        const d = Math.hypot(npc.pos[0] - playerPos[0], npc.pos[1] - playerPos[1]);
        const lod = v.avatar.lodLevel;
        if (lod === 0 && d > LOD1_DISTANCE + LOD_HYSTERESIS) v.avatar.setLod(1);
        else if (lod === 1 && d < LOD1_DISTANCE - LOD_HYSTERESIS) v.avatar.setLod(0);
      }
      v.avatar.talking = npc.phase === 'paused';
      v.avatar.play(this.clipFor(npc));
      v.avatar.update(dt, npc.phase === 'travel' ? 1 : 0, reducedMotion);
      this.updateHit(npc.id, v, dt, camera, w, h);
      // Personas glance at the CEO walking past (REQ-ANIM-05); seated workers keep their eyes on the screen.
      if (visible && playerPos && !(npc.phase === 'perform' && npc.workStatus === 'working')) {
        const d = Math.hypot(npc.pos[0] - playerPos[0], npc.pos[1] - playerPos[1]);
        v.avatar.lookAt(d < 2.5 ? new THREE.Vector3(playerPos[0], v.next.y + 1.4, -playerPos[1]) : null, dt, reducedMotion);
      } else v.avatar.lookAt(null, dt, reducedMotion);
      if (!visible) { v.label.style.opacity = '0'; continue; }
      const s = v.avatar.root.position.clone().add(new THREE.Vector3(0, 1.9, 0)).project(camera);
      const screenY = ((1 - s.y) / 2) * h;
      const screenX = ((s.x + 1) / 2) * w;
      const busy = npc.workStatus === 'working' || npc.workStatus === 'waiting';
      const activityText = `${npc.name} · ${busy ? t(WORK_LABEL[npc.workStatus]) : (ACTIVITY_LABEL[npc.activity] ? t(ACTIVITY_LABEL[npc.activity]) : npc.activity)}`;
      v.label.classList.toggle('busy', busy);
      if (v.label.textContent !== activityText) v.label.textContent = activityText;
      // The speech bubble replaces the name tag while a reprimand plays.
      const on = s.z < 1 && Math.abs(s.x) < 1.05 && Math.abs(s.y) < 1.05 && !this.hits.get(npc.id)?.bubble
        && labelClear(screenX - v.label.offsetWidth / 2, screenY - v.label.offsetHeight,
          v.label.offsetWidth, v.label.offsetHeight, labelBlockers);
      v.label.style.opacity = on ? '1' : '0';
      if (on) {
        v.label.style.transform = `translate(-50%, -100%) translate(${((s.x + 1) / 2) * w}px, ${((1 - s.y) / 2) * h}px)`;
      }
    }
  }

  face(id: string): { expressions: Record<string, number>; lod: number } | null {
    const v = this.views.get(id);
    return v ? { expressions: v.avatar.expressions(), lod: v.avatar.lodLevel } : null;
  }

  /** Count of visible personas per LOD level (perf harness / tests). */
  lodCounts(): { lod0: number; lod1: number } {
    let lod0 = 0;
    let lod1 = 0;
    for (const v of this.views.values()) if (v.avatar.root.visible) { if (v.avatar.lodLevel === 1) lod1++; else lod0++; }
    return { lod0, lod1 };
  }

  nearest(floor: FloorId, pos: [number, number], radius: number): NpcState | null {
    let best: NpcState | null = null;
    let bd = radius;
    for (const npc of this.sim.npcs) {
      if (npc.floor !== floor) continue;
      const d = Math.hypot(npc.pos[0] - pos[0], npc.pos[1] - pos[1]);
      if (d <= bd) { bd = d; best = npc; }
    }
    return best;
  }

  faceTowards(id: string, pos: [number, number]): void {
    const npc = this.sim.npcs.find((n) => n.id === id);
    if (npc) npc.facing = (Math.atan2(pos[1] - npc.pos[1], pos[0] - npc.pos[0]) * 180) / Math.PI;
  }
}
