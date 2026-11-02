// Procedural stylised furniture kit (blockout tier, original). Each builder
// works in a local frame: X = fixture width, Y = up, +Z = fixture front
// (plan -Y at rot 0). Parts are later merged per material, so builders only
// describe geometry + colour. M3 replaces families with Blender GLBs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ARTWORK, ENV } from './palette';
import type { Fixture } from './types';

export interface Part { geo: THREE.BufferGeometry; color: number; emissive?: boolean; glass?: boolean; offsetSteps?: number }

const P: Part[] = [];

function push(geo: THREE.BufferGeometry, color: number, opts: Partial<Part> = {}) {
  P.push({ geo, color, ...opts });
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, r = 0.03, opts: Partial<Part> = {}) {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  // Only large parts get rounded edges; small parts would spend triangles on
  // bevels nobody can see at the 3/4 camera distance.
  const big = Math.max(w, h, d) >= 0.35 && Math.min(w, h, d) >= 0.06;
  const g = rr > 0.02 && big ? new RoundedBoxGeometry(w, h, d, 1, rr) : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  push(g, color, opts);
}

function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 10) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y + h / 2, z);
  push(g, color);
}

function blob(r: number, x: number, y: number, z: number, color: number, sx = 1, sy = 1, sz = 1, detail = 1) {
  if (r < 0.06) detail = 0;
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  push(g, color);
}

function legs(w: number, d: number, h: number, inset: number, color: number, t = 0.05) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(t, h, t, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), color, 0.01);
}

function table(w: number, d: number, h: number, top: number = ENV.wood, leg: number = ENV.woodDark) {
  box(w, 0.05, d, 0, h - 0.05, 0, top, 0.025);
  legs(w, d, h - 0.05, 0.08, leg);
}

function chairShape(w: number, d: number, h: number, seat: number, frame: number, back = true) {
  const sh = 0.45;
  box(w * 0.9, 0.09, d * 0.85, 0, sh - 0.09, 0.02, seat, 0.04);
  if (back) box(w * 0.86, h - sh, 0.08, 0, sh - 0.02, -d / 2 + 0.07, seat, 0.04);
  cyl(0.03, 0.03, sh - 0.09, 0, 0, 0, frame, 8);
  box(w * 0.7, 0.04, 0.06, 0, 0.02, 0, frame, 0.01);
  box(0.06, 0.04, d * 0.7, 0, 0.02, 0, frame, 0.01);
}

function plant(w: number, h: number, big: boolean) {
  const potH = big ? 0.42 : 0.3;
  cyl(w * 0.36, w * 0.28, potH, 0, 0, 0, ENV.pot, 16);
  const leaf = big ? ENV.plantLeaf : ENV.plantLeafDark;
  const r = w * 0.42;
  blob(r, 0, potH + r * 0.9, 0, leaf, 1, 1.15, 1);
  blob(r * 0.75, w * 0.18, potH + r * 1.7, w * 0.05, ENV.plantLeaf, 1, 1.1, 1);
  if (big) blob(r * 0.7, -w * 0.15, Math.min(h - r * 0.6, potH + r * 2.4), -w * 0.08, ENV.plantLeafDark, 1, 1.2, 1);
}

function books(w: number, h: number, d: number, rows: number) {
  const colors = [ENV.fabricTerracotta, ENV.fabricGreen, ENV.fabricMustard, ENV.fabricBlue, ENV.paper, ENV.fabricSage];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const y = 0.08 + (r * (h - 0.12)) / rows;
    let x = -w / 2 + 0.07;
    while (x < w / 2 - 0.12) {
      const bw = 0.05 + ((k * 37) % 5) * 0.012;
      const bh = 0.18 + ((k * 53) % 4) * 0.03;
      box(bw, bh, d * 0.6, x + bw / 2, y, 0.02, colors[k % colors.length], 0.006);
      x += bw + 0.008;
      k++;
    }
  }
}

function panel(w: number, h: number, d: number, y: number, frame: number, face: number, artwork?: string) {
  box(w, h, d, 0, y, 0, frame, 0.02);
  box(w * 0.88, h * 0.84, 0.01, 0, y + h * 0.08, d / 2 + 0.004, face, 0, { emissive: false });
  if (artwork && ARTWORK[artwork]) {
    const [a, b, c] = ARTWORK[artwork];
    // Simple original geometric composition: hill, sun disc and a stripe.
    // Overlays are 4 mm narrower than the face so their sides never share its plane.
    box(w * 0.88 - 0.004, h * 0.3, 0.012, 0, y + h * 0.08, d / 2 + 0.008, a, 0);
    const disc = new THREE.CircleGeometry(Math.min(w, h) * 0.16, 20);
    disc.translate(w * 0.18, y + h * 0.62, d / 2 + 0.012);
    push(disc, c);
    box(w * 0.5, h * 0.05, 0.014, -w * 0.12, y + h * 0.45, d / 2 + 0.01, b, 0);
  }
}

/** 8x8 chessboard with a wooden rim on a table top (catur is played there). */
function chessboard(h: number) {
  const n = 8, sq = 0.06, s0 = -((n - 1) * sq) / 2;
  box(n * sq + 0.06, 0.012, n * sq + 0.06, 0, h, 0, ENV.woodDark, 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) box(sq, 0.006, sq, s0 + i * sq, h + 0.012, s0 + j * sq, (i + j) % 2 ? 0x3b2f2a : 0xf0e6d2, 0);
}

/** Extra parts drawn on top of a Blender kit model (the kit has no board). */
export function kitOverlay(fx: Fixture): Part[] {
  P.length = 0;
  if (fx.type === 'board_table') chessboard(fx.size[2]);
  return P.slice();
}

export function buildFixture(fx: Fixture): Part[] {
  P.length = 0;
  const [w, d, h] = fx.size;
  switch (fx.type) {
    case 'desk':
    case 'desk_exec': {
      table(w, d, h, fx.type === 'desk_exec' ? ENV.woodDark : ENV.wood, ENV.woodDark);
      box(w * 0.32, 0.36, 0.04, 0, h + 0.1, -d / 2 + 0.15, ENV.screen, 0.015);
      box(w * 0.3, 0.32, 0.01, 0, h + 0.12, -d / 2 + 0.172, ENV.screenGlow, 0, { emissive: true });
      box(0.06, 0.1, 0.06, 0, h, -d / 2 + 0.15, ENV.metal, 0.01);
      box(0.42, 0.02, 0.14, 0, h, 0.05, ENV.metalLight, 0.008);
      if (fx.type === 'desk_exec') cyl(0.06, 0.05, 0.12, w * 0.35, h, 0, ENV.white, 10);
      break;
    }
    case 'monitor': {
      // PC monitor standing on a desk top (desk height 0.75): base + neck +
      // screen body with a glowing face on both sides (box, so the seated
      // user and anyone opposite both see the lit screen).
      box(0.22, 0.02, 0.16, 0, 0.75, 0, ENV.metal, 0.008);
      box(0.05, 0.14, 0.04, 0, 0.77, 0, ENV.metal, 0.01);
      box(0.55, 0.34, 0.03, 0, 0.91, 0, ENV.screen, 0.015);
      box(0.51, 0.30, 0.01, 0, 0.93, 0.02, ENV.screenGlow, 0, { emissive: true });
      break;
    }
    case 'chair': chairShape(w, d, h, ENV.fabricGreen, ENV.metal); break;
    case 'chair_guest': chairShape(w, d, h, ENV.fabricSage, ENV.woodDark); break;
    case 'stool': chairShape(w, d, h, ENV.fabricTerracotta, ENV.woodDark, false); break;
    case 'meeting_table': case 'dining_table': case 'coffee_table': case 'work_table': case 'board_table':
      table(w, d, h, fx.type === 'board_table' ? ENV.woodLight : ENV.wood);
      if (fx.type === 'board_table') chessboard(h);
      break;
    case 'high_table': table(w, d, h, ENV.woodLight); break;
    case 'round_table':
      cyl(w / 2, w / 2, 0.05, 0, h - 0.05, 0, ENV.wood, 24);
      cyl(0.05, 0.05, h - 0.05, 0, 0, 0, ENV.woodDark, 10);
      cyl(0.25, 0.28, 0.04, 0, 0, 0, ENV.woodDark, 16);
      break;
    case 'plan_table':
      table(w, d, h, ENV.woodLight);
      box(w * 0.8, 0.008, d * 0.7, 0, h, 0, 0x8fb2c9, 0);
      box(w * 0.5, 0.009, 0.01, 0, h + 0.002, 0, ENV.white, 0);
      break;
    case 'drafting_table': {
      legs(w, d, h - 0.15, 0.1, ENV.woodDark);
      const g = new RoundedBoxGeometry(w, 0.04, d, 2, 0.015);
      g.rotateX(0.35);
      g.translate(0, h, 0);
      push(g, ENV.woodLight);
      break;
    }
    case 'lab_bench':
      table(w, d, h, ENV.metalLight, ENV.metal);
      box(0.3, 0.12, 0.25, -w * 0.25, h, -0.1, ENV.screen, 0.02);
      box(0.2, 0.08, 0.15, w * 0.2, h, 0, ENV.fabricBlue, 0.02);
      break;
    case 'reception_desk':
      box(w, h, d, 0, 0, 0, ENV.wood, 0.08);
      box(w + 0.06, 0.05, d * 0.45, 0, h, d * 0.3, ENV.woodLight, 0.02);
      box(w * 0.9, h * 0.35, 0.02, 0, h * 0.35, d / 2 + 0.005, ENV.fabricGreen, 0.01);
      break;
    case 'sofa': case 'armchair': {
      const col = fx.type === 'sofa' ? ENV.fabricGreen : ENV.fabricTerracotta;
      box(w, 0.42, d, 0, 0.04, 0, col, 0.1);
      box(w, h - 0.04, 0.24, 0, 0.04, -d / 2 + 0.12, col, 0.1);
      box(0.18, 0.6, d, -w / 2 + 0.09, 0.04, 0, col, 0.08);
      box(0.18, 0.6, d, w / 2 - 0.09, 0.04, 0, col, 0.08);
      const seats = fx.type === 'sofa' ? 2 : 1;
      for (let s = 0; s < seats; s++) {
        const cx = seats === 1 ? 0 : (s - 0.5) * (w - 0.4) * 0.5;
        box((w - 0.4) / seats - 0.04, 0.14, d - 0.3, cx, 0.46, 0.08, ENV.fabricCream, 0.06);
      }
      box(0.06, 0.04, 0.06, -w / 2 + 0.1, 0, d / 2 - 0.1, ENV.woodDark, 0.01);
      box(0.06, 0.04, 0.06, w / 2 - 0.1, 0, d / 2 - 0.1, ENV.woodDark, 0.01);
      break;
    }
    case 'beanbag': blob(w * 0.48, 0, 0.26, 0, ENV.fabricMustard, 1, 0.55, 1, 2); break;
    case 'bench':
      box(w, 0.07, d, 0, h - 0.07, 0, ENV.wood, 0.03);
      box(0.08, h - 0.07, d * 0.8, -w / 2 + 0.15, 0, 0, ENV.woodDark, 0.02);
      box(0.08, h - 0.07, d * 0.8, w / 2 - 0.15, 0, 0, ENV.woodDark, 0.02);
      break;
    case 'bookshelf': case 'model_shelf': case 'storage_shelf':
      // Back panel sits between the sides (not under them): no shared side/top planes.
      box(w - 0.082, h - 0.002, 0.04, 0, 0, -d / 2 + 0.02, ENV.woodDark, 0.01);
      box(0.04, h, d, -w / 2 + 0.02, 0, 0, ENV.wood, 0.01);
      box(0.04, h, d, w / 2 - 0.02, 0, 0, ENV.wood, 0.01);
      for (let r = 0; r <= 4; r++) box(w - 0.06, 0.03, d - 0.04, 0, (r * (h - 0.03)) / 4, 0, ENV.wood, 0.01);
      if (fx.type === 'storage_shelf') {
        for (let r = 0; r < 4; r++) box(w * 0.35, 0.25, d * 0.7, ((r % 2) - 0.5) * w * 0.45, 0.04 + (r * (h - 0.03)) / 4, 0, ENV.fabricCream, 0.03);
      } else if (fx.type === 'model_shelf') {
        for (let r = 1; r < 4; r++) blob(0.09, ((r % 3) - 1) * 0.3, (r * (h - 0.03)) / 4 + 0.12, 0, [ENV.fabricTerracotta, ENV.fabricBlue, ENV.fabricMustard][r % 3], 1, 1.2, 1);
      } else books(w, h, d, 4);
      break;
    case 'tool_cabinet': case 'locker':
      box(w, h, d, 0, 0, 0, fx.type === 'locker' ? ENV.fabricSage : ENV.fabricBlue, 0.03);
      for (let k = 0; k < (fx.type === 'locker' ? 3 : 4); k++) {
        if (fx.type === 'locker') box(0.02, h * 0.85, 0.01, -w / 2 + ((k + 1) * w) / 4, h * 0.06, d / 2 + 0.003, ENV.metal, 0);
        else box(w * 0.9, 0.02, 0.01, 0, (k + 1) * (h / 5), d / 2 + 0.003, ENV.metal, 0);
      }
      break;
    case 'whiteboard': panel(w, h, d, 0.9, ENV.metalLight, ENV.white); break;
    case 'wall_display': panel(w, h, d, 1.1, ENV.screen, ENV.screenGlow); break;
    case 'poster': panel(w, h, d, 1.2, ENV.woodLight, ENV.paper, fx.artwork); break;
    case 'directory_sign':
      panel(w, h, d, 1.0, ENV.wallCap, ENV.fabricCream);
      for (let k = 0; k < 4; k++) box(w * 0.6, 0.04, 0.012, -w * 0.08, 1.15 + k * 0.15, d / 2 + 0.01, ENV.wallCap, 0);
      break;
    case 'gallery_panel':
      box(w, 0.08, d, 0, 0, 0, ENV.woodDark, 0.02);
      panel(w, h - 0.15, d * 0.4, 0.12, ENV.fabricCream, ENV.paper, fx.artwork);
      break;
    case 'easel':
      for (const sx of [-1, 1]) box(0.04, h, 0.04, sx * 0.25, 0, 0, ENV.woodDark, 0.01);
      box(0.04, h * 0.9, 0.04, 0, 0, -0.3, ENV.woodDark, 0.01);
      panel(w * 0.75, 0.7, 0.03, 0.75, ENV.paper, ENV.paper, 'ART-09');
      break;
    case 'plant_large': plant(w, h, true); break;
    case 'plant_small': plant(w, h, false); break;
    case 'planter_box':
      box(w, h * 0.6, d, 0, 0, 0, ENV.woodDark, 0.04);
      for (let k = -2; k <= 2; k++) blob(d * 0.32, (k * w) / 5.5, h * 0.62, ((k % 2) * d) / 8, k % 2 ? ENV.plantLeaf : ENV.plantLeafDark, 1, 0.9, 1);
      break;
    case 'tree_planter':
      box(w, 0.45, d, 0, 0, 0, ENV.woodDark, 0.06);
      cyl(0.08, 0.11, h * 0.6, 0, 0.45, 0, ENV.woodDark, 10);
      blob(w * 0.55, 0, h * 0.75, 0, ENV.plantLeaf, 1, 0.85, 1, 2);
      blob(w * 0.38, w * 0.25, h * 0.88, 0.1, ENV.plantLeafDark, 1, 0.9, 1);
      break;
    case 'pantry_counter': case 'coffee_bar':
      box(w, h - 0.05, d, 0, 0, 0, fx.type === 'coffee_bar' ? ENV.fabricGreen : ENV.fabricCream, 0.03);
      box(w + 0.04, 0.05, d + 0.04, 0, h - 0.05, 0, ENV.woodLight, 0.02);
      box(0.32, 0.38, 0.3, -w * 0.3, h, -0.1, ENV.metal, 0.04);
      box(0.08, 0.05, 0.05, -w * 0.3, h + 0.12, 0.08, ENV.accent, 0.01);
      for (let k = 0; k < 3; k++) cyl(0.04, 0.035, 0.09, w * 0.1 + k * 0.12, h, 0.05, [ENV.white, ENV.accent, ENV.fabricMustard][k], 10);
      break;
    case 'fridge': box(w, h, d, 0, 0, 0, ENV.white, 0.06); box(0.03, 0.4, 0.02, w * 0.35, h * 0.5, d / 2 + 0.01, ENV.metal, 0.01); break;
    case 'sink': box(w, h, d, 0, 0, 0, ENV.white, 0.05); cyl(0.015, 0.015, 0.2, 0, h, -d * 0.3, ENV.metalLight, 8); break;
    case 'wc':
      box(w * 0.9, 0.4, d * 0.55, 0, 0, 0.08, ENV.white, 0.12);
      box(w, h - 0.05, d * 0.3, 0, 0, -d / 2 + d * 0.15, ENV.white, 0.05);
      break;
    case 'partition': box(w, h, d, 0, 0.1, 0, ENV.fabricSage, 0.01); break;
    case 'shower_stall':
      box(w, 0.08, d, 0, 0, 0, ENV.white, 0.02);
      box(w, h, 0.03, 0, 0.08, -d / 2 + 0.015, ENV.glass, 0, { glass: true });
      box(0.03, h, d, -w / 2 + 0.015, 0.08, 0, ENV.glass, 0, { glass: true });
      box(0.03, h, d, w / 2 - 0.015, 0.08, 0, ENV.glass, 0, { glass: true });
      cyl(0.08, 0.08, 0.02, 0, h - 0.1, -d * 0.3, ENV.metalLight, 12);
      break;
    case 'rack_42u':
      box(w, h, d, 0, 0, 0, ENV.screen, 0.02);
      for (let k = 0; k < 8; k++) box(w * 0.8, 0.03, 0.01, 0, 0.3 + k * 0.2, d / 2 + 0.004, k % 3 ? ENV.metal : ENV.screenGlow, 0, { emissive: k % 3 === 0 });
      break;
    case 'lab_rack_open':
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.04, h, 0.04, sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02), ENV.metal, 0.01);
      for (let k = 0; k < 3; k++) box(w * 0.85, 0.05, d * 0.8, 0, 0.25 + k * 0.35, 0, ENV.metalLight, 0.01);
      break;
    case 'billiard_table':
      box(w, 0.18, d, 0, h - 0.18, 0, ENV.woodDark, 0.06);
      box(w - 0.24, 0.02, d - 0.24, 0, h - 0.01, 0, ENV.felt, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.14, h - 0.18, 0.14, sx * (w / 2 - 0.25), 0, sz * (d / 2 - 0.25), ENV.woodDark, 0.03);
      blob(0.03, 0.4, h + 0.03, 0.1, ENV.white, 1, 1, 1, 1);
      blob(0.03, -0.5, h + 0.03, -0.15, ENV.accent, 1, 1, 1, 1);
      blob(0.03, -0.55, h + 0.03, 0.05, ENV.fabricMustard, 1, 1, 1, 1);
      break;
    case 'cue_rack':
      box(w, 0.08, d, 0, 0.9, 0, ENV.woodDark, 0.01);
      for (let k = 0; k < 4; k++) box(0.02, 1.3, 0.02, -w / 2 + 0.12 + k * 0.12, 0.15, d / 2 + 0.01, ENV.woodLight, 0);
      break;
    case 'media_console':
      box(w, 0.45, d, 0, 0, 0, ENV.wood, 0.04);
      box(w * 0.85, 0.75, 0.06, 0, 0.6, -d / 2 + 0.06, ENV.screen, 0.02);
      box(w * 0.8, 0.68, 0.01, 0, 0.63, -d / 2 + 0.095, ENV.screenGlow, 0, { emissive: true });
      box(0.3, 0.06, 0.2, 0.4, 0.45, 0.05, ENV.white, 0.02);
      break;
    case 'arcade_cabinet':
      box(w, h, d, 0, 0, 0, ENV.fabricBlue, 0.04);
      box(w * 0.8, 0.45, 0.02, 0, h * 0.58, d / 2 + 0.005, ENV.screenGlow, 0.01, { emissive: true });
      box(w * 0.9, 0.08, 0.25, 0, h * 0.48, d / 2, ENV.screen, 0.02);
      blob(0.03, -0.12, h * 0.53, d / 2 + 0.06, ENV.accent, 1, 1, 1, 1);
      box(w + 0.006, 0.143, d + 0.006, 0, h - 0.14, 0, ENV.fabricMustard, 0.03);
      break;
    case 'treadmill':
      box(w * 0.8, 0.18, d, 0, 0, 0, ENV.rubber, 0.04);
      for (const sx of [-1, 1]) box(0.06, 1.1, 0.06, sx * w * 0.38, 0.15, -d / 2 + 0.15, ENV.metal, 0.02);
      box(w * 0.8, 0.12, 0.25, 0, 1.2, -d / 2 + 0.15, ENV.screen, 0.03);
      break;
    case 'exercise_bike':
      box(0.12, 0.08, d, 0, 0, 0, ENV.metal, 0.02);
      box(0.08, 0.7, 0.08, 0, 0.05, 0.2, ENV.metal, 0.02);
      box(0.28, 0.07, 0.3, 0, 0.75, 0.22, ENV.rubber, 0.03);
      box(0.08, 0.9, 0.08, 0, 0.05, -d / 2 + 0.15, ENV.metal, 0.02);
      box(0.45, 0.05, 0.08, 0, 0.95, -d / 2 + 0.15, ENV.rubber, 0.02);
      cyl(0.22, 0.22, 0.06, 0, 0.1, -0.15, ENV.accent, 16);
      break;
    case 'exercise_mat': box(w, 0.02, d, 0, 0, 0, ENV.fabricSage, 0.005); break;
    case 'dumbbell_rack':
      box(w, h * 0.7, d, 0, 0, 0, ENV.metal, 0.02);
      for (let k = 0; k < 4; k++) box(0.18, 0.1, 0.1, -w / 2 + 0.18 + k * 0.28, h * 0.7, 0, ENV.rubber, 0.04);
      break;
    case 'stair_u': {
      // Two flights of 12 risers; west half rises north, east half rises south.
      const risers = 12;
      const rise = 2.0 / risers;
      const flightW = (w - 0.2) / 2;
      const run = 0.28;
      for (let k = 0; k < risers; k++) {
        box(flightW, rise * (k + 1), run, -w / 2 + flightW / 2, 0, d / 2 - run / 2 - k * run, ENV.woodLight, 0.01);
      }
      box(w, 2.0, d - risers * run, 0, 0, -d / 2 + (d - risers * run) / 2, ENV.wood, 0.02);
      for (let k = 0; k < risers; k++) {
        const z = -d / 2 + (d - risers * run) + k * run + run / 2;
        box(flightW, 2.0 + rise * (k + 1), run, w / 2 - flightW / 2, 0, z, ENV.woodLight, 0.01);
      }
      box(0.2, 3.0, d - 0.3, 0, 0, 0.15, ENV.wallInterior, 0.02);
      break;
    }
    case 'lift':
      box(w, h, d, 0, 0, 0, ENV.wallExterior, 0.04);
      box(w * 0.55, 2.1, 0.03, 0, 0, d / 2 + 0.01, ENV.metalLight, 0.01);
      box(0.012, 2.096, 0.035, 0, 0.002, d / 2 + 0.012, ENV.metal, 0); // seam inside the door's top plane
      box(0.08, 0.14, 0.03, w * 0.38, 1.0, d / 2 + 0.01, ENV.accent, 0.01, { emissive: true });
      break;
    default:
      box(w, h, d, 0, 0, 0, ENV.fabricCream, 0.04);
  }
  return P.splice(0, P.length);
}
