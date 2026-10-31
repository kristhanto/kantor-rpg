// Reprimand (PRD v2.0 REQ-TEGUR): slapstick props and per-persona lines.
// Visual only: nothing here talks to an agent, the backend or Telegram.
//
// ScoldFx plays the CEO's side of one reprimand: the prop pops into the CEO's
// right hand, winds up behind the shoulder (anticipation), swings fast on an
// ease-in curve with a motion trail, then the impact frame: a short hit-stop,
// a flash, a cartoon word ("PLAK!", "TUK!", "POK!") and a small screen shake.
// The paper ball is thrown instead: a parabola from the hand to the head, two
// bounces on the floor, then it shrinks away. The persona's side (squash, hop,
// orbiting stars, speech bubble, run to the desk) is NpcLayer.react().
// Everything created here is disposed when the effect ends.
import * as THREE from 'three';
import { t } from '../i18n';

export type ScoldProp = 'gulungan' | 'palu' | 'bola';

export const SCOLD_PROPS: { id: ScoldProp; label: string; sfx: string }[] = [
  { id: 'gulungan', label: 'Tepuk gulungan kertas', sfx: 'swat' },
  { id: 'palu', label: 'Ketuk palu mainan', sfx: 'boing' },
  { id: 'bola', label: 'Lempar bola kertas', sfx: 'pop' },
];

/** Cartoon word shown on the impact frame (Indonesian source; t() translates). */
export const IMPACT_WORD: Record<ScoldProp, string> = { gulungan: 'PLAK!', palu: 'TUK!', bola: 'POK!' };

/** One line per persona, in character. Indonesian source; t() translates. */
export const SCOLD_LINES: Record<string, string[]> = {
  'ACT-MAX': ['Siap! Data IDX ETP saya ambil sekarang.', 'Oke, datanya saya cek lagi.'],
  'ACT-HUGO': ['Siap, hitungannya saya lanjutkan.', 'Iya, yield dan repo rate saya hitung ulang.'],
  'ACT-NOVA': ['Siap, rekapnya saya tulis lagi.', 'Oke, tabelnya saya rapikan.'],
  'ACT-BRUNO': ['Siap, auditnya saya jalankan.', 'Oke, checklistnya saya periksa satu per satu.'],
  'ACT-KEVIN': ['Siap, pengirimannya saya siapkan.', 'Oke, rekapnya saya kirim tepat waktu.'],
  'ACT-REX': ['Teguran diterima. Status: kembali kerja.', 'Bug ditemukan: saya. Diperbaiki.'],
  'ACT-ECHO': ['Eh, iya! Catatannya saya lanjutkan.', 'Maaf, Pak. Langsung kerja.'],
  'ACT-LEO': ['Aduh, ide saya buyar! Balik ke meja.', 'Oke, desainnya saya kejar.'],
};
export const SCOLD_FALLBACK = 'Aduh! Iya, kembali kerja.';

const PAPER = 0xf4ecdc;
const RED = 0xc0533a;
const WOOD = 0x9a6b43;

/** Prop length from the grip (m): the tip is what lands on the head. */
export const PROP_LENGTH: Record<ScoldProp, number> = { gulungan: 0.6, palu: 0.56, bola: 0.09 };

/**
 * Small procedural prop mesh (no asset download). The grip is the origin and
 * the prop points along +Y; the hammer head lies across the swing plane.
 */
export function propMesh(kind: ScoldProp): THREE.Group {
  const g = new THREE.Group();
  g.name = `scold-${kind}`;
  if (kind === 'gulungan') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.6, 12), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.9 }));
    roll.position.y = 0.3;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 12), new THREE.MeshStandardMaterial({ color: RED }));
    band.position.y = 0.38;
    g.add(roll, band);
  } else if (kind === 'palu') {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 14), new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5 }));
    head.rotation.x = Math.PI / 2;
    head.position.y = 0.48;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 8), new THREE.MeshStandardMaterial({ color: WOOD }));
    stick.position.y = 0.23;
    g.add(head, stick);
  } else {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 1, flatShading: true }));
    g.add(ball);
  }
  return g;
}

// ---- timing and curves (pure, unit tested) ----------------------------------
export const easeOutBack = (x: number) => { const c1 = 1.9; const c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
export const easeInCubic = (x: number) => x * x * x;
export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Seconds on the effect clock (the hit-stop is extra, on top of these). */
export const TIMING = { pop: 0.12, windup: 0.3, hold: 0.08, swing: 0.11, hitStop: 0.08, follow: 0.42 };
/** Effect time of contact for the melee props (and of release for the ball). */
export const SWING_END = TIMING.pop + TIMING.windup + TIMING.hold + TIMING.swing;
/** The ball leaves the hand slightly before the arm finishes its arc. */
export const BALL_RELEASE = SWING_END - TIMING.swing * 0.25;

/**
 * Arm angle (radians from straight up, positive toward the persona) at effect
 * time `t`. `aHit` is the angle that puts the tip on the head. The prop pops in
 * low and forward, winds back behind the shoulder with a little overshoot,
 * holds for a beat, then snaps forward on an ease-in curve.
 */
export function swingAngle(kind: ScoldProp, t: number, aHit: number, reducedMotion = false): number {
  const start = 2.4;
  const back = kind === 'bola' ? -1.35 : -0.8;
  const end = kind === 'bola' ? 1.45 : aHit;
  const w0 = TIMING.pop;
  const w1 = w0 + TIMING.windup;
  const w2 = w1 + TIMING.hold;
  if (t < w0) return start;
  if (t < w1) {
    const k = clamp01((t - w0) / TIMING.windup);
    return start + (back - start) * (reducedMotion ? easeOutCubic(k) : easeOutBack(k));
  }
  if (t < w2) return reducedMotion ? back : back - 0.1 * Math.sin(((t - w1) / TIMING.hold) * Math.PI);
  if (t < SWING_END) return back + (end - back) * easeInCubic(clamp01((t - w2) / TIMING.swing));
  return end;
}

/** Parabolic flight from a to b, `k` in 0..1, apex `h` metres above the chord. */
export function arcPoint(a: THREE.Vector3, b: THREE.Vector3, k: number, h: number, out = new THREE.Vector3()): THREE.Vector3 {
  out.lerpVectors(a, b, k);
  out.y += 4 * h * k * (1 - k);
  return out;
}

// ---- the effect ---------------------------------------------------------------
export interface ScoldFxOptions {
  scene: THREE.Object3D;
  kind: ScoldProp;
  reducedMotion: boolean;
  /** CEO avatar root and loaded model (null while the placeholder shows). */
  ceo: { root: THREE.Object3D; model: THREE.Object3D | null };
  /** Persona head in world space, read every frame (the persona may move). */
  head: () => THREE.Vector3;
  /** Floor height (world y) under the persona, for the ball bounce. */
  floorY: number;
  camera?: THREE.Camera;
  /** Element nudged by the screen shake (the WebGL canvas). */
  shake?: HTMLElement | null;
  /** Called every frame until it returns true: the CEO steps closer first. */
  approach?: (dt: number, elapsed: number) => boolean;
  /** Prop starts its fast swing (whoosh sound). */
  onSwing?: () => void;
  /** Contact. Called exactly once, even if the effect is cut short. */
  onImpact: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const TRAIL = 4;

export class ScoldFx {
  readonly group = new THREE.Group();
  readonly kind: ScoldProp;
  private clock = 0;
  private approachT = 0;
  private approaching: boolean;
  private stop = 0;
  private swung = false;
  private impacted = false;
  private disposed = false;
  private prop: THREE.Group;
  private geos = new Set<THREE.BufferGeometry>();
  private mats = new Set<THREE.Material>();
  private texs = new Set<THREE.Texture>();
  private ghosts: THREE.Object3D[] = [];
  private history: THREE.Matrix4[] = [];
  private word: THREE.Sprite | null = null;
  private flash: THREE.Sprite | null = null;
  private wordAge = 0;
  private arm: { upper: THREE.Object3D; hand: THREE.Object3D } | null = null;
  private armW = 0;
  private fwd = new THREE.Vector3(0, 0, -1);
  private side = new THREE.Vector3(1, 0, 0);
  private aHit = 1.2;
  private reach = 1;
  private armLen = 0.55;
  private ball: { from: THREE.Vector3; t: number; dur: number; h: number; vel: THREE.Vector3 | null; bounces: number; doneAt: number } | null = null;
  private shakeT = -1;
  private endAt = Infinity;

  constructor(private o: ScoldFxOptions) {
    this.kind = o.kind;
    this.group.name = 'scold-fx';
    this.prop = propMesh(o.kind);
    this.track(this.prop);
    this.prop.visible = false;
    this.group.add(this.prop);
    o.scene.add(this.group);
    this.approaching = !!o.approach;
    const upper = o.ceo.model?.getObjectByName('upper_arm_R');
    const hand = o.ceo.model?.getObjectByName('hand_R');
    if (upper?.parent && hand) this.arm = { upper, hand };
    if (!o.reducedMotion && o.kind !== 'bola') {
      // Motion trail: translucent copies sharing the prop geometry, placed on
      // the prop's recent world matrices during the fast swing.
      for (let i = 0; i < TRAIL; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0, depthWrite: false });
        this.mats.add(mat);
        const ghost = new THREE.Group();
        this.prop.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh) return;
          const copy = new THREE.Mesh(mesh.geometry, mat);
          copy.position.copy(mesh.position);
          copy.rotation.copy(mesh.rotation);
          ghost.add(copy);
        });
        ghost.matrixAutoUpdate = false;
        ghost.visible = false;
        this.ghosts.push(ghost);
        this.group.add(ghost);
      }
    }
  }

  get finished(): boolean { return this.disposed; }
  get hasImpacted(): boolean { return this.impacted; }
  /** True during the hit-stop: callers may freeze the persona too. */
  get frozen(): boolean { return this.stop > 0; }
  /** Still walking toward the persona (the caller steers the CEO). */
  get isApproaching(): boolean { return this.approaching; }
  /** Live object count, for the leak test. */
  get resources(): number { return this.geos.size + this.mats.size + this.texs.size; }

  private track(obj: THREE.Object3D) {
    obj.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) {
        this.geos.add(mesh.geometry);
        const mm = mesh.material;
        for (const x of Array.isArray(mm) ? mm : [mm]) this.mats.add(x);
      }
    });
  }

  /** Swing-plane basis: forward from the CEO toward the persona, side across it. */
  private orient(head: THREE.Vector3) {
    const p = this.o.ceo.root.position;
    this.fwd.set(head.x - p.x, 0, head.z - p.z);
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.side.crossVectors(this.fwd, UP).normalize();
  }

  private dirAt(a: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(UP).multiplyScalar(Math.cos(a)).addScaledVector(this.fwd, Math.sin(a)).normalize();
  }

  private shoulder(out: THREE.Vector3): THREE.Vector3 {
    if (this.arm) return this.arm.upper.getWorldPosition(out);
    return out.copy(this.o.ceo.root.position).addScaledVector(UP, 1.42).addScaledVector(this.side, 0.24);
  }

  /**
   * Rotate the right upper arm (after the clip posed it) so the shoulder-to-hand
   * line points along `d`, blended by armW, and return the hand position. The
   * placeholder has no bones: the hand is then computed from the shoulder.
   */
  private poseArm(d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const sh = this.shoulder(new THREE.Vector3());
    if (!this.arm) return out.copy(sh).addScaledVector(d, this.armLen * this.armW + 0.3 * (1 - this.armW));
    const { upper, hand } = this.arm;
    const cur = hand.getWorldPosition(new THREE.Vector3()).sub(sh);
    const len = cur.length();
    if (len > 1e-4) {
      this.armLen = len;
      if (this.armW > 0) {
        const q = new THREE.Quaternion().setFromUnitVectors(cur.divideScalar(len), d);
        q.slerp(new THREE.Quaternion(), 1 - this.armW);
        const pw = upper.parent!.getWorldQuaternion(new THREE.Quaternion());
        const hw = pw.clone().multiply(upper.quaternion).premultiply(q);
        upper.quaternion.copy(pw.invert().multiply(hw));
        upper.updateWorldMatrix(false, true);
      }
    }
    return hand.getWorldPosition(out);
  }

  /** Grip in the hand, prop along `d`, `stretch` lengthens it (cartoon reach). */
  private holdProp(hand: THREE.Vector3, d: THREE.Vector3, stretch: number, size: number) {
    const x = new THREE.Vector3().crossVectors(d, this.side).normalize();
    const z = new THREE.Vector3().crossVectors(x, d).normalize();
    this.prop.position.copy(hand);
    this.prop.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, z));
    this.prop.scale.set(size, size * stretch, size);
  }

  /** Advance by `dt` seconds. Returns false once finished (and disposed). */
  update(dt: number): boolean {
    if (this.disposed) return false;
    if (this.stop > 0) { this.stop -= dt; dt = 0; }
    this.updateShake(dt);
    if (this.approaching) {
      this.approachT += dt;
      if (!this.o.approach!(dt, this.approachT) && this.approachT < 1.4) return true;
      this.approaching = false;
    }
    this.clock += dt;
    const t = this.clock;
    this.o.ceo.root.updateWorldMatrix(true, true);
    const head = this.o.head();
    this.orient(head);
    if (!this.impacted) {
      const sh = this.shoulder(new THREE.Vector3());
      const to = head.clone().addScaledVector(UP, this.kind === 'bola' ? 0 : 0.14).sub(sh);
      this.aHit = Math.atan2(to.dot(this.fwd), to.dot(UP));
      // Rubber-hose reach: the prop stretches so its tip lands on the head.
      this.reach = THREE.MathUtils.clamp((to.length() - this.armLen) / PROP_LENGTH[this.kind], 0.85, 3.5);
    }
    this.prop.visible = true;
    if (this.kind === 'bola') this.updateThrow(t, head, dt);
    else this.updateSwing(t, head);
    this.recordTrail(t);
    this.updateSprites(dt);
    if (this.impacted && t >= this.endAt && !this.word?.visible) { this.dispose(); return false; }
    if (t > 6) this.dispose(); // safety net: never outlive a lost target
    return !this.disposed;
  }

  private startSwing(t: number) {
    if (!this.swung && t >= SWING_END - TIMING.swing) { this.swung = true; this.o.onSwing?.(); }
  }

  private updateSwing(t: number, head: THREE.Vector3) {
    const rm = this.o.reducedMotion;
    this.startSwing(t);
    let a: number;
    let stretch = 1;
    let size = 1;
    if (!this.impacted) {
      a = swingAngle(this.kind, t, this.aHit, rm);
      const k = clamp01((t - (SWING_END - TIMING.swing)) / TIMING.swing);
      stretch = 1 + (this.reach - 1) * easeInCubic(k);
      size = rm ? 1 : easeOutBack(clamp01(t / TIMING.pop));
      this.armW = clamp01(t / TIMING.pop);
    } else {
      // Follow-through: a small rebound off the head, then the prop shrinks away.
      const f = t - SWING_END;
      a = this.aHit - (rm ? 0 : 0.5 * Math.sin(clamp01(f / 0.22) * Math.PI) * Math.exp(-f * 4));
      stretch = this.reach + (1 - this.reach) * easeOutCubic(clamp01(f / 0.12));
      const fade = clamp01((f - (TIMING.follow - 0.18)) / 0.18);
      size = 1 - fade;
      this.armW = 1 - fade;
    }
    const d = this.dirAt(a);
    const hand = this.poseArm(d, new THREE.Vector3());
    this.holdProp(hand, d, stretch, Math.max(0.001, size));
    if (!this.impacted && t >= SWING_END) {
      this.impact(head, hand.clone().addScaledVector(d, PROP_LENGTH[this.kind] * this.reach));
      this.endAt = SWING_END + TIMING.follow + 0.4;
    }
  }

  private updateThrow(t: number, head: THREE.Vector3, dt: number) {
    const rm = this.o.reducedMotion;
    this.startSwing(t);
    if (!this.ball) {
      this.armW = clamp01(t / TIMING.pop);
      const d = this.dirAt(swingAngle('bola', t, this.aHit, rm));
      const hand = this.poseArm(d, new THREE.Vector3());
      this.prop.position.copy(hand).addScaledVector(d, 0.07);
      this.prop.scale.setScalar(rm ? 1 : Math.max(0.001, easeOutBack(clamp01(t / TIMING.pop))));
      if (t >= BALL_RELEASE) {
        const dist = this.prop.position.distanceTo(head);
        this.ball = { from: this.prop.position.clone(), t: 0, dur: THREE.MathUtils.clamp(dist / 6.5, 0.22, 0.6), h: 0.2 + dist * 0.08, vel: null, bounces: 0, doneAt: Infinity };
      }
      return;
    }
    // Arm finishes its arc, then relaxes back into the clip pose.
    this.armW = Math.max(0, this.armW - dt / 0.35);
    this.poseArm(this.dirAt(Math.min(1.9, swingAngle('bola', t, this.aHit, rm) + (t - BALL_RELEASE) * 2)), new THREE.Vector3());
    const b = this.ball;
    if (!this.impacted) {
      b.t += dt;
      const k = clamp01(b.t / b.dur);
      arcPoint(b.from, head, k, b.h, this.prop.position);
      this.prop.rotation.x += dt * 15;
      this.prop.rotation.z += dt * 9;
      if (k >= 1) {
        this.impact(head, head);
        if (rm) { this.prop.visible = false; this.endAt = t + 0.8; this.ball.doneAt = t; }
        else b.vel = this.fwd.clone().multiplyScalar(-1.2).addScaledVector(this.side, 0.6).addScaledVector(UP, 2.1);
      }
      return;
    }
    if (!b.vel) { this.prop.visible = false; return; }
    // Bounce off the head, two hops on the floor, then shrink away.
    b.vel.y -= 9.8 * dt;
    this.prop.position.addScaledVector(b.vel, dt);
    this.prop.rotation.x += dt * 6 * b.vel.length();
    const floor = this.o.floorY + 0.09;
    if (this.prop.position.y < floor) {
      this.prop.position.y = floor;
      if (b.bounces < 2) { b.vel.y = Math.abs(b.vel.y) * 0.45; b.vel.x *= 0.55; b.vel.z *= 0.55; b.bounces++; }
      else if (b.doneAt === Infinity) { b.vel.set(0, 0, 0); b.doneAt = t + 0.35; this.endAt = b.doneAt + 0.05; }
    }
    if (b.doneAt !== Infinity) this.prop.scale.setScalar(Math.max(0.001, (b.doneAt - t) / 0.35));
    else if (b.t > b.dur + 2.5) { b.doneAt = t + 0.35; this.endAt = b.doneAt + 0.05; }
  }

  private recordTrail(t: number) {
    if (!this.ghosts.length) return;
    const from = SWING_END - TIMING.swing;
    this.prop.updateMatrixWorld(true);
    if (t >= from && t <= SWING_END + 0.03 && this.stop <= 0) {
      this.history.push(this.prop.matrixWorld.clone());
      if (this.history.length > 10) this.history.shift();
    }
    const fade = this.impacted ? clamp01(1 - (t - SWING_END) / 0.18) : 1;
    // Spread the copies across the recorded arc; older ones are fainter.
    const n = this.history.length;
    this.ghosts.forEach((g, i) => {
      const idx = n - 1 - Math.round(((i + 1) * (n - 1)) / (TRAIL + 1));
      const h = n > 1 && idx >= 0 ? this.history[idx] : null;
      g.visible = !!h && fade > 0;
      if (!h) return;
      g.matrix.copy(h);
      g.matrixWorldNeedsUpdate = true;
      ((g.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (0.5 - i * 0.1) * fade;
    });
  }

  /** Contact: hit-stop, flash, cartoon word, screen shake. Reduced motion: the word only. */
  private impact(head: THREE.Vector3, at: THREE.Vector3) {
    if (this.impacted) return;
    this.impacted = true;
    const rm = this.o.reducedMotion;
    if (!rm) { this.stop = TIMING.hitStop; this.shakeT = 0; }
    const spot = at.clone().lerp(head, 0.5).addScaledVector(UP, 0.3);
    if (this.o.camera) {
      // Pull the sprites toward the camera so the head never hides them.
      const cam = this.o.camera.getWorldPosition(new THREE.Vector3());
      spot.addScaledVector(cam.sub(spot).normalize(), 0.4);
    }
    const word = makeWordSprite(t(IMPACT_WORD[this.kind]));
    if (word) {
      this.mats.add(word.material);
      if (word.material.map) this.texs.add(word.material.map);
      word.position.copy(spot).addScaledVector(this.side, 0.25).addScaledVector(UP, 0.15);
      setWordScale(word, rm ? 0.8 : 0.35);
      this.word = word;
      this.group.add(word);
    }
    if (!rm) {
      const flash = makeFlashSprite();
      if (flash) {
        this.mats.add(flash.material);
        if (flash.material.map) this.texs.add(flash.material.map);
        flash.position.copy(spot).addScaledVector(UP, -0.2);
        flash.scale.setScalar(1.1);
        this.flash = flash;
        this.group.add(flash);
      }
    }
    this.o.onImpact();
  }

  private updateSprites(dt: number) {
    if (this.word) {
      this.wordAge += dt;
      const w = this.wordAge;
      const m = this.word.material;
      if (!this.o.reducedMotion) {
        // Pop in with overshoot, wobble, drift up a little.
        const s = w < 0.08 ? 0.35 + 0.95 * (w / 0.08) : 1 + 0.3 * Math.exp(-(w - 0.08) * 9) * Math.cos((w - 0.08) * 28);
        setWordScale(this.word, s);
        this.word.position.y += dt * 0.3;
        m.rotation = -0.16 + 0.08 * Math.sin(w * 20) * Math.exp(-w * 5);
      }
      m.opacity = w < 0.6 ? 1 : Math.max(0, 1 - (w - 0.6) / 0.3);
      this.word.visible = m.opacity > 0;
    }
    if (this.flash?.visible) {
      const m = this.flash.material;
      m.opacity = Math.max(0, m.opacity - dt / 0.15);
      this.flash.scale.multiplyScalar(1 + dt * 4);
      this.flash.visible = m.opacity > 0;
    }
  }

  private updateShake(dt: number) {
    const el = this.o.shake;
    if (!el || this.shakeT < 0) return;
    this.shakeT += Math.max(dt, 1 / 120);
    const k = 1 - this.shakeT / 0.25;
    if (k <= 0) { el.style.translate = ''; this.shakeT = -1; return; }
    const a = 7 * k;
    el.style.translate = `${(Math.sin(this.shakeT * 95) * a).toFixed(1)}px ${(Math.cos(this.shakeT * 73) * a * 0.6).toFixed(1)}px`;
  }

  /** Remove every object and free GPU resources. Safe to call twice; fires onImpact if it never happened. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.impacted) { this.impacted = true; this.o.onImpact(); }
    if (this.o.shake) this.o.shake.style.translate = '';
    this.group.removeFromParent();
    this.group.clear();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const x of this.texs) x.dispose();
    this.geos.clear();
    this.mats.clear();
    this.texs.clear();
    this.ghosts = [];
    this.history = [];
    this.word = null;
    this.flash = null;
  }
}

/** Word sprites keep the 4:3 canvas aspect. */
function setWordScale(s: THREE.Sprite, w: number) { s.scale.set(w, w * 0.75, 1); }

function canvas(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d');
}

/** Comic burst with the impact word, drawn once on a canvas (drawn on top of the scene). */
export function makeWordSprite(word: string): THREE.Sprite | null {
  const g = canvas(256, 192);
  if (!g) return null;
  const cx = 128;
  const cy = 96;
  g.beginPath();
  for (let i = 0; i < 22; i++) {
    const r = i % 2 ? 0.62 : 1 - (i % 4) * 0.05;
    const a = (i / 22) * Math.PI * 2;
    g.lineTo(cx + Math.cos(a) * r * 120, cy + Math.sin(a) * r * 86);
  }
  g.closePath();
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#2b2118';
  g.lineWidth = 6;
  g.lineJoin = 'round';
  g.fill();
  g.stroke();
  g.font = 'italic 900 60px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#ffffff';
  g.strokeText(word, cx, cy + 3);
  g.fillStyle = '#b8322a';
  g.fillText(word, cx, cy + 3);
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.name = 'scold-word';
  s.renderOrder = 20;
  return s;
}

/** Soft white flash on contact. */
export function makeFlashSprite(): THREE.Sprite | null {
  const g = canvas(64, 64);
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.35, 'rgba(255,236,170,0.75)');
  grad.addColorStop(1, 'rgba(255,236,170,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(g.canvas);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.name = 'scold-flash';
  s.renderOrder = 19;
  return s;
}
