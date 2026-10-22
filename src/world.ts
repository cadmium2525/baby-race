import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type RaceState, type Baby } from './simulation';
import { DEFAULT_STYLES, getCourse, type Accessory, type BabyStyle, type CourseId, type CourseZone, type EventId } from './content';
import { dampRaceCamera, fitRaceCamera, type RaceCameraFrame } from './camera';
import { type CinematicFrame } from './cinematic';

const C = { cream: 0xf9f5e9, mint: 0xa6d7c8, pink: 0xeab7bb, yellow: 0xf4d68c, lilac: 0xc5bcdf, blue: 0xb6d9e4, ink: 0x514e55, skin: 0xf4c9a6 };
const sphere = new THREE.SphereGeometry(1, 20, 14);
const confettiGeometry = new THREE.PlaneGeometry(.1, .18);
const materials = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .82 }));
  return materials.get(color)!;
}
function ball(parent: THREE.Object3D, color: number, position: number[], scale: number[]) {
  const m = new THREE.Mesh(sphere, material(color));
  m.position.set(position[0], position[1], position[2]); m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent: THREE.Object3D, color: number, position: number[], scale: number[], radius = .12) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(scale[0], scale[1], scale[2], 2, radius), material(color));
  m.position.set(position[0], position[1], position[2]); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function tube(parent: THREE.Object3D, color: number, points: THREE.Vector3[], radius: number) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, radius, 8, false), material(color));
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function labelTexture(text: string, color: string) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.font = '900 100px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 384, 96);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function floorLabel(parent: THREE.Object3D, text: string, color: string, x: number, z: number, w = 5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: labelTexture(text, color), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .18, z); parent.add(m);
}
function duck(parent: THREE.Object3D, x: number, z: number, size = 1) {
  const g = new THREE.Group(); g.position.set(x, .18, z); g.scale.setScalar(size);
  ball(g, 0xf1cd67, [0, .26, 0], [.45, .32, .52]); ball(g, 0xf9d878, [0, .65, -.22], [.31, .34, .31]); ball(g, 0xeaa05a, [0, .58, -.53], [.23, .09, .16]);
  ball(g, C.ink, [-.21, .72, -.43], [.034, .049, .034]); ball(g, C.ink, [.21, .72, -.43], [.034, .049, .034]); ball(g, 0xfbe9ab, [-.36, .28, .03], [.08, .17, .29]); parent.add(g); return g;
}
function milkBottle(parent: THREE.Object3D, x: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, .17, z); g.rotation.z = -.12;
  box(g, 0xfffaf2, [0, .48, 0], [.48, .75, .48], .16); box(g, C.pink, [0, .9, 0], [.5, .13, .5], .05); ball(g, 0xe7bd9d, [0, 1.04, 0], [.12, .16, .12]);
  for (let i = 0; i < 3; i++) box(g, C.blue, [-.07, .35 + i * .14, -.247], [.17, .025, .015], .005);
  parent.add(g);
}
function toyRing(parent: THREE.Object3D, color: number, x: number, z: number, r: number) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, .13, 10, 30), material(color)); m.rotation.x = Math.PI / 2; m.position.set(x, .35, z); m.castShadow = true; parent.add(m); return m;
}
function clearObjects(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.geometry !== sphere && obj.geometry !== confettiGeometry) geometries.add(obj.geometry);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) if (mat instanceof THREE.MeshBasicMaterial) { mat.map?.dispose(); mat.dispose(); }
  });
  geometries.forEach(g => g.dispose()); group.clear();
}
function addAccessory(parent: THREE.Group, kind: Accessory, color: number) {
  if (kind === 'curl') {
    tube(parent, 0x9c775c, [new THREE.Vector3(0, .52, -.1), new THREE.Vector3(-.08, .67, -.03), new THREE.Vector3(.08, .69, .01), new THREE.Vector3(.14, .61, -.02)], .037);
  } else if (kind === 'bow') {
    for (const side of [-1, 1]) { const loop = ball(parent, color, [side * .19, .52, -.19], [.25, .14, .12]); loop.rotation.z = side * -.35; }
    ball(parent, 0xffe6d4, [0, .52, -.22], [.095, .1, .12]);
  } else if (kind === 'cap') {
    ball(parent, color, [0, .42, .04], [.6, .27, .52]); ball(parent, color, [0, .34, -.46], [.57, .045, .35]); ball(parent, 0xfff6e5, [0, .68, .03], [.08, .065, .08]);
  } else if (kind === 'crown') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.4, .36, .14, 12, 1, true), material(0xf2cf73)); band.position.set(0, .54, .02); parent.add(band);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2; const point = new THREE.Mesh(new THREE.ConeGeometry(.13, .36, 4), material(0xf2cf73));
      point.position.set(Math.sin(angle) * .33, .77, Math.cos(angle) * .33 + .02); parent.add(point);
      ball(parent, i % 2 ? color : C.pink, [Math.sin(angle) * .33, .97, Math.cos(angle) * .33 + .02], [.05, .05, .05]);
    }
  } else {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.5, .055, 8, 24, Math.PI), material(0xfffaf0)); band.position.y = .06; parent.add(band);
    for (const side of [-1, 1]) {
      const ear = ball(parent, 0xfffaf0, [side * .25, .9, 0], [.14, .46, .12]); ear.rotation.z = side * -.2;
      const inner = ball(parent, C.pink, [side * .25, .91, -.105], [.065, .31, .025]); inner.rotation.z = side * -.2;
    }
  }
}
function sparkle(parent: THREE.Object3D, color: number, x: number, y: number, z: number, size = .12) {
  const group = new THREE.Group(); group.position.set(x, y, z);
  const vertical = ball(group, color, [0, 0, 0], [size * .2, size, size * .18]);
  ball(group, color, [0, 0, 0], [size, size * .2, size * .18]); parent.add(group); return { group, vertical };
}
/** Every event prop is constructed once and reused, including hidden shaders. */
function buildHappenings(root: THREE.Group, body: THREE.Group, head: THREE.Group, color: number, skin: number) {
  const changing = new THREE.Group(); root.add(changing); changing.visible = false;
  box(changing, 0xb9dfdb, [0, .14, .2], [2.25, .17, 2.6], .08);
  box(changing, 0xfff9e9, [0, .235, .2], [2.06, .025, 2.38], .01);
  const wipes = new THREE.Group(); wipes.position.set(.87, .36, .75); changing.add(wipes);
  box(wipes, 0x91c9bb, [0, 0, 0], [.55, .2, .5], .08);
  box(wipes, 0xfffcf2, [0, .11, 0], [.29, .035, .28], .01);
  const wipe = box(changing, 0xffffff, [0, .93, .55], [.58, .035, .48], .016);
  const freshDiaper = new THREE.Group(); freshDiaper.position.set(-.78, .4, .65); changing.add(freshDiaper);
  box(freshDiaper, 0xffffff, [0, 0, 0], [.63, .15, .52], .07);
  box(freshDiaper, 0xaad8d4, [0, .082, 0], [.2, .025, .48], .01);
  const cleanDiaper = ball(body, 0xffffff, [0, .61, .64], [.49, .38, .36]); cleanDiaper.visible = false;
  const poop = new THREE.Group(); poop.position.set(.75, 2.05, -.15); root.add(poop); poop.visible = false;
  ball(poop, 0xfffbef, [0, 0, .04], [.43, .47, .085]);
  ball(poop, 0xbc8a67, [0, -.18, -.04], [.3, .13, .1]);
  ball(poop, 0xbc8a67, [-.025, -.02, -.04], [.22, .12, .1]);
  ball(poop, 0xbc8a67, [.025, .12, -.04], [.14, .1, .09]);
  ball(poop, 0xbc8a67, [.07, .23, -.04], [.07, .075, .07]);
  for (const side of [-1, 1]) ball(poop, C.ink, [side * .085, -.14, -.14], [.023, .032, .018]);
  ball(poop, 0xffeed0, [0, -.23, -.135], [.055, .018, .015]);
  const cleanStars = new THREE.Group(); root.add(cleanStars); cleanStars.visible = false;
  for (let i = 0; i < 5; i++) sparkle(cleanStars, i % 2 ? 0xffffff : 0xf1d47d, Math.sin(i * 1.7) * .95, 1.15 + i * .14, Math.cos(i * 1.7) * .65, .12);

  const droppedPacifier = new THREE.Group(); root.add(droppedPacifier); droppedPacifier.visible = false;
  const pacifierColors: THREE.Mesh[] = [ball(droppedPacifier, color, [0, 0, 0], [.19, .13, .055])];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.11, .035, 8, 20), material(color)); ring.position.z = -.09; droppedPacifier.add(ring); pacifierColors.push(ring);
  ball(droppedPacifier, 0xfffaef, [0, 0, .06], [.075, .065, .08]);
  const tears = new THREE.Group(); head.add(tears); tears.visible = false;
  const tearDrops: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const drop = new THREE.Group(); tears.add(drop);
    ball(drop, 0x72cce9, [0, 0, 0], [.074, .115, .045]);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.06, .13, 8), material(0x72cce9)); tip.position.y = .11; drop.add(tip);
    ball(drop, 0xe4faff, [-.023, .04, -.043], [.017, .038, .01]); tearDrops.push(drop);
  }
  // Small portraits communicate the real contagion without putting another
  // full-size racer in front of the featured face during a closeup.
  const chorus = new THREE.Group(); root.add(chorus); chorus.visible = false;
  const cryBuddies: {root: THREE.Group; badge: THREE.Mesh; slot: number; styleColor: string}[] = [];
  for (let i = 0; i < 3; i++) {
    const portrait = new THREE.Group(); portrait.position.set((i - 1) * .88, 2.12 + (i === 1 ? .22 : 0), -.05); chorus.add(portrait);
    const badge = ball(portrait, color, [0, 0, .025], [.34, .34, .085]);
    ball(portrait, skin, [0, -.015, -.075], [.235, .23, .085]);
    for (const side of [-1, 1]) {
      const eye = box(portrait, C.ink, [side * .085, .035, -.158], [.075, .022, .018], .007); eye.rotation.z = side * -.3;
      ball(portrait, 0x72cce9, [side * .15, -.065, -.145], [.036, .075, .025]);
    }
    ball(portrait, 0x684250, [0, -.105, -.16], [.06, .073, .018]); cryBuddies.push({ root: portrait, badge, slot: -1, styleColor: '' });
  }

  const makeup = new THREE.Group(); head.add(makeup); makeup.visible = false;
  for (const side of [-1, 1]) {
    ball(makeup, 0xd797d3, [side * .23, .13, -.517], [.145, .073, .027]);
    tube(makeup, 0x36253c, [new THREE.Vector3(side * .1, .08, -.535), new THREE.Vector3(side * .22, .13, -.555), new THREE.Vector3(side * .35, .1, -.51), new THREE.Vector3(side * .48, .21, -.46)], .018);
    for (let lash = 0; lash < 5; lash++) {
      const x = side * (.12 + lash * .052);
      tube(makeup, 0x36253c, [new THREE.Vector3(x, .13, -.548), new THREE.Vector3(x + side * .025, .22 + lash * .007, -.57), new THREE.Vector3(x + side * .055, .29 + lash * .009, -.545)], .012);
    }
    ball(makeup, 0xf58cbf, [side * .38, -.12, -.466], [.115, .075, .025]);
    sparkle(makeup, 0xfff1a6, side * .43, .025, -.47, .045);
  }
  ball(makeup, 0xf545a1, [-.045, -.185, -.558], [.075, .038, .034]);
  ball(makeup, 0xf545a1, [.045, -.185, -.558], [.075, .038, .034]);
  ball(makeup, 0xfa55ac, [0, -.244, -.552], [.13, .045, .035]);
  box(makeup, 0x9d3979, [0, -.216, -.59], [.16, .013, .015], .005);
  const partyHair = new THREE.Group(); head.add(partyHair); partyHair.visible = false;
  ball(partyHair, 0xf5cf81, [0, .39, .1], [.59, .31, .49]);
  for (let i = 0; i < 5; i++) { const lock = ball(partyHair, i % 2 ? 0xf0bb6c : 0xffdc94, [(i - 2) * .17, .39, -.37], [.17, .22, .14]); lock.rotation.z = -.3 + i * .13; }
  for (const side of [-1, 1]) {
    ball(partyHair, 0xf4c271, [side * .69, .2, .08], [.26, .38, .26]);
    ball(partyHair, 0xff64bc, [side * .59, .3, -.02], [.1, .13, .14]);
  }
  const party = new THREE.Group(); root.add(party); party.visible = false;
  const disco = new THREE.Group(); disco.position.set(1.15, 2.5, .25); party.add(disco);
  const mirrorMaterial = new THREE.MeshStandardMaterial({ color: 0xf2e9ff, roughness: .2, metalness: .8 });
  const mirrorCore = new THREE.Mesh(sphere, mirrorMaterial); mirrorCore.scale.setScalar(.28); disco.add(mirrorCore);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(.085, .075, .018), mirrorMaterial, 48); disco.add(tiles);
  const stamp = new THREE.Object3D(), normal = new THREE.Vector3(), axis = new THREE.Vector3(0, 0, 1);
  for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
    const latitude = (row + .5) / 6 * Math.PI, angle = col / 8 * Math.PI * 2;
    normal.set(Math.sin(latitude) * Math.sin(angle), Math.cos(latitude), Math.sin(latitude) * Math.cos(angle));
    stamp.position.copy(normal).multiplyScalar(.294); stamp.quaternion.setFromUnitVectors(axis, normal); stamp.updateMatrix(); tiles.setMatrixAt(row * 8 + col, stamp.matrix);
  }
  box(party, 0xe1d0e8, [1.15, 3, .25], [.015, .47, .015], .005);
  const partyStars: THREE.Group[] = [];
  for (let i = 0; i < 7; i++) partyStars.push(sparkle(party, i % 2 ? 0xffd6f0 : 0xf6df8c, Math.sin(i * 2.4) * 1.22, .7 + i * .23, Math.cos(i * 2.4) * .55, .13).group);
  return { changing, wipes, wipe, freshDiaper, cleanDiaper, poop, cleanStars, droppedPacifier, pacifierColors, tears, tearDrops, chorus, cryBuddies, makeup, partyHair, party, disco, partyStars, phase: '', cryingCount: 0 };
}
interface DoublePart { source: THREE.Object3D; copy: THREE.Object3D }
/** Clone only the ordinary baby graph. Geometry and texture ownership remains
 * with the original; only the translucent materials belong to these doubles. */
function buildDoubles(body: THREE.Group, head: THREE.Group, happenings: ReturnType<typeof buildHappenings>, root = new THREE.Group()) {
  const excluded = new Set<THREE.Object3D>([happenings.cleanDiaper, happenings.tears, happenings.makeup, happenings.partyHair]);
  const privateMaterials = new Map<THREE.Material, THREE.Material>();
  const copies: {anchor: THREE.Group; head: THREE.Object3D; parts: DoublePart[]}[] = [];
  const translucent = (source: THREE.Material) => {
    let copy = privateMaterials.get(source);
    if (!copy) { copy = source.clone(); copy.transparent = true; copy.opacity = .56; copy.depthWrite = false; privateMaterials.set(source, copy); }
    return copy;
  };
  const clonePart = (source: THREE.Object3D, parts: DoublePart[]): THREE.Object3D => {
    const copy = source.clone(false); parts.push({ source, copy });
    if (copy instanceof THREE.Mesh) {
      copy.material = Array.isArray(copy.material) ? copy.material.map(translucent) : translucent(copy.material);
      copy.castShadow = false; copy.receiveShadow = false;
    }
    for (const child of source.children) if (!excluded.has(child)) copy.add(clonePart(child, parts));
    return copy;
  };
  root.clear(); root.visible = false;
  for (const side of [-1, 1]) {
    const anchor = new THREE.Group(); anchor.position.set(side * 1.55, .015, .6); anchor.scale.setScalar(.88);
    const parts: DoublePart[] = []; anchor.add(clonePart(body, parts)); root.add(anchor); copies.push({ anchor, head: parts.find(part => part.source === head)!.copy, parts });
  }
  return { root, copies, privateMaterials };
}
function buildBaby(style: BabyStyle, skin: number) {
  const color = new THREE.Color(style.color).getHex(); const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const clothing: THREE.Mesh[] = [ball(body, color, [0, .66, .25], [.48, .39, .64])]; ball(body, 0xfffaf1, [0, .6, .62], [.47, .36, .34]);
  const head = new THREE.Group(); head.position.set(0, 1.01, -.39); body.add(head);
  ball(head, skin, [0, 0, 0], [.59, .58, .56]); ball(head, skin, [-.57, -.03, -.02], [.12, .17, .12]); ball(head, skin, [.57, -.03, -.02], [.12, .17, .12]);
  const eyes: THREE.Mesh[] = []; const eyebrows: THREE.Mesh[] = []; const eyeHighlights: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(ball(head, C.ink, [side * .22, .055, -.513], [.045, .066, .027])); eyeHighlights.push(ball(head, 0xfffcf1, [side * .22 - .009, .077, -.538], [.012, .018, .009])); ball(head, 0xecaaa0, [side * .36, -.13, -.43], [.105, .055, .018]);
    const brow = box(head, C.ink, [side * .22, .18, -.515], [.13, .025, .025], .01); brow.visible = false; eyebrows.push(brow);
  }
  ball(head, skin, [0, -.065, -.561], [.085, .065, .052]); const mouth = ball(head, 0xf2a9a5, [0, -.22, -.509], [.14, .09, .04]);
  const pacifier = new THREE.Mesh(new THREE.TorusGeometry(.071, .026, 8, 20), material(color)); pacifier.position.set(0, -.23, -.577); head.add(pacifier); clothing.push(pacifier);
  const accessory = new THREE.Group(); head.add(accessory); addAccessory(accessory, style.accessory, color); const limbs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .43, .69, -.22); body.add(arm); clothing.push(ball(arm, color, [side * .04, -.06, 0], [.18, .19, .2]));
    ball(arm, skin, [side * .06, -.27, -.13], [.14, .27, .15]); ball(arm, skin, [side * .07, -.45, -.2], [.19, .10, .19]); limbs.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .34, .51, .65); body.add(leg); ball(leg, skin, [side * .1, -.12, .03], [.22, .24, .23]); ball(leg, skin, [side * .14, -.28, .19], [.14, .13, .24]); limbs.push(leg);
  }
  for (let i = 0; i < 3; i++) ball(body, 0xf8f6ed, [0, .94, -.02 + i * .2], [.04, .018, .04]);
  const speedLines = new THREE.Group(); for (let i = 0; i < 3; i++) box(speedLines, 0xfffbef, [(i - 1) * .5, .14, 1.2 + (i % 2) * .35], [.045, .035, .8 + (i % 2) * .5], .015);
  root.add(speedLines); speedLines.visible = false;
  const happenings = buildHappenings(root, body, head, color, skin);
  const doubles = buildDoubles(body, head, happenings); const ghosts = doubles.root; root.add(ghosts);
  const presentation = { baby: null as Baby | null, eventId: null as EventId | null, lastStateTime: 0, showcased: false, animationOffset: 0, cutElapsed: 0, inCut: false };
  return { root, body, head, limbs, speedLines, clothing, accessory, eyes, eyeHighlights, eyebrows, mouth, pacifier, ghosts, doubles, happenings, presentation, accessoryKind: style.accessory, styleKey: `${style.color}/${style.accessory}` };
}
function buildRattle(color: number) {
  const root = new THREE.Group(); const toy = new THREE.Group(); root.add(toy); const colored: THREE.Mesh[] = [];
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .54, 4, 12), material(color)); handle.position.y = .25; toy.add(handle); colored.push(handle); colored.push(ball(toy, color, [0, .8, 0], [.35, .35, .35]));
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(.347, .043, 8, 28), material(0xfff8e6)); stripe.position.y = .8; stripe.rotation.x = Math.PI / 2; toy.add(stripe); ball(toy, 0xfff9e9, [-.12, .93, .27], [.065, .065, .025]);
  const wave = new THREE.Mesh(new THREE.RingGeometry(.4, .44, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false })); wave.rotation.x = -Math.PI / 2; root.add(wave);
  const range = new THREE.Mesh(new THREE.RingGeometry(8.46, 8.5, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false })); range.rotation.x = -Math.PI / 2; root.add(range);
  return { root, toy, wave, range, colored };
}

export class GameWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 180);
  babies = DEFAULT_STYLES.map((style, i) => buildBaby(style, [C.skin, 0xf2c7a6, 0xe7b18d, 0xf7d5b8][i]));
  rattles = DEFAULT_STYLES.map(style => buildRattle(new THREE.Color(style.color).getHex()));
  raycaster = new THREE.Raycaster(); ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.2);
  target = new THREE.Vector3(-4.8, 0, 10.5); viewHeight = 14; width = 1; height = 1;
  effects: {mesh: THREE.Mesh, velocity: THREE.Vector3, life: number}[] = [];
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private scenery = new THREE.Group(); private movingScenery = new THREE.Group(); private courseId: CourseId | null = null;
  private rollingBalls: {root: THREE.Group; x: number; z: number; width: number; depth: number; phase: number}[] = [];
  private cameraOffset = new THREE.Vector3(13, 20, 23);
  private raceCamera: RaceCameraFrame = { x: -4.8, y: 0, z: 10.5, height: 14 };
  private desiredCamera: RaceCameraFrame = { x: -4.8, y: 0, z: 10.5, height: 14 };
  private savedCamera: RaceCameraFrame = { x: 0, y: 0, z: 0, height: 14 };
  private savedRotation = new THREE.Quaternion(); private closeRotation = new THREE.Quaternion();
  private closeTarget = new THREE.Vector3(); private closeEye = new THREE.Vector3(); private cameraUp = new THREE.Vector3(0, 1, 0);
  private closeMatrix = new THREE.Matrix4();
  private cutBabyId = -1; private cutEvent: CinematicFrame['eventId'] | null = null; private cutElapsed = 0;
  private cameraInitialized = false; private materialsNeedWarmup = true;
  private moodScratch = new THREE.Vector3();
  private moodScreens = Array.from({length: 4}, () => ({ x: 0, y: 0, visible: false }));
  constructor(public container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); this.renderer.setClearColor(C.cream);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute('aria-label', '4人の赤ちゃんとガラガラが走る3Dプレイマット'); this.renderer.domElement.id = 'game-canvas'; container.prepend(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(C.cream, 55, 110); this.scene.add(new THREE.HemisphereLight(0xfffcf3, 0xc6b5c3, 2.6));
    const sun = new THREE.DirectionalLight(0xfff6e7, 3.3); sun.position.set(-10, 22, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -28; sun.shadow.camera.right = 28; sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28; sun.shadow.camera.far = 65;
    sun.shadow.normalBias = .035; sun.shadow.bias = -.0001; sun.shadow.radius = 5; this.scene.add(sun);
    this.scene.add(this.scenery, this.movingScenery); this.buildCourse('nursery');
    this.babies.forEach(b => { b.root.scale.setScalar(1.16); this.scene.add(b.root); }); this.rattles.forEach(r => this.scene.add(r.root)); this.resize();
    this.camera.position.copy(this.target).add(this.cameraOffset); this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
    // compile traverses hidden meshes too: rare eyebrows/speed lines and the
    // translucent doubles must not compile their first shader during a race.
    this.renderer.compile(this.scene, this.camera); this.materialsNeedWarmup = false;
  }
  private bakeScenery() {
    // This traversal excludes babies, animated balls and effects on every rebuild.
    this.scenery.updateMatrixWorld(true); const batches = new Map<THREE.Material, THREE.Mesh[]>();
    this.scenery.traverse(obj => { if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial)) return; const batch = batches.get(obj.material) ?? []; batch.push(obj); batches.set(obj.material, batch); });
    batches.forEach((meshes, mat) => {
      const geometries = meshes.map(mesh => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld)); const geometry = mergeGeometries(geometries);
      if (geometry) { const old = new Set<THREE.BufferGeometry>(); meshes.forEach(mesh => { if (mesh.geometry !== sphere) old.add(mesh.geometry); mesh.removeFromParent(); }); old.forEach(g => g.dispose()); const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; this.scenery.add(mesh); }
      geometries.forEach(g => g.dispose());
    });
  }
  private buildZone(zone: CourseZone, index: number) {
    const depth = zone.zStart - zone.zEnd; const z = (zone.zStart + zone.zEnd) / 2;
    const colors = { toy: 0xf5d58c, ball: 0xe5a9ac, cushion: 0xc1b7db, echo: 0x83baa9, sprint: 0xefc967 };
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(zone.width, depth), new THREE.MeshBasicMaterial({ color: colors[zone.kind], transparent: true, opacity: .16, depthWrite: false })); overlay.rotation.x = -Math.PI / 2; overlay.position.set(zone.x, .157, z); this.scenery.add(overlay);
    for (const x of [zone.x - zone.width / 2, zone.x + zone.width / 2]) box(this.scenery, colors[zone.kind], [x, .17, z], [.05, .035, depth], .012);
    if (zone.kind === 'toy') {
      milkBottle(this.scenery, zone.x + zone.width * .2, z + depth * .22); toyRing(this.scenery, C.pink, zone.x - zone.width * .2, z - depth * .22, .32); box(this.scenery, C.mint, [zone.x, .34, z], [.42, .36, .42], .06);
    } else if (zone.kind === 'ball') {
      for (let i = 0; i < 2; i++) { const root = new THREE.Group(); ball(root, [C.pink, C.blue][i], [0, 0, 0], [.4, .4, .4]); const stripe = new THREE.Mesh(new THREE.TorusGeometry(.4, .025, 8, 24), material(0xfffaee)); stripe.rotation.x = Math.PI / 2; root.add(stripe); this.movingScenery.add(root); this.rollingBalls.push({ root, x: zone.x, z: z + (i ? -.6 : .6), width: Math.max(0, zone.width / 2 - .55), depth, phase: index + i * Math.PI }); }
      floorLabel(this.scenery, '○  ○  ○', '#b48490', zone.x, zone.zStart - .35, Math.min(5, zone.width - .4));
    } else if (zone.kind === 'cushion') {
      const cols = Math.max(1, Math.floor(zone.width / 1.8));
      for (let row = 0; row < 2; row++) for (let col = 0; col < cols; col++) { const x = zone.x + (col - (cols - 1) / 2) * 1.65; const cushion = box(this.scenery, (row + col) % 2 ? 0xddd4e9 : 0xc9c0df, [x, .29, z + (row ? -.65 : .65)], [1.45, .29, Math.min(1.05, depth / 3)], .14); cushion.rotation.y = ((row + col) % 3 - 1) * .08; ball(this.scenery, 0xf7eff6, [x, .447, z + (row ? -.65 : .65)], [.055, .015, .055]); }
    } else if (zone.kind === 'echo') {
      for (let row = 0; row < 3; row++) floorLabel(this.scenery, '♪   )))   ♪', '#629b8e', zone.x, z + (row - 1) * depth * .28, Math.min(6, zone.width - .25));
    } else {
      for (let row = 0; row < 3; row++) for (const x of [-2.4, 0, 2.4]) { const shape = new THREE.Shape(); shape.moveTo(-.27, .28); shape.lineTo(0, -.16); shape.lineTo(.27, .28); shape.lineTo(.27, .08); shape.lineTo(0, -.36); shape.lineTo(-.27, .08); shape.closePath(); const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(0xfff8dd)); arrow.rotation.set(-Math.PI / 2, 0, Math.PI); arrow.position.set(x, .18, z + (row - 1) * 1.25); this.scenery.add(arrow); }
    }
  }
  private buildCourse(id: CourseId) {
    clearObjects(this.scenery); clearObjects(this.movingScenery); this.rollingBalls.length = 0; this.courseId = id;
    const course = getCourse(id); const palette = course.palette; this.renderer.setClearColor(course.background); this.scene.fog = new THREE.Fog(course.background, 55, 110);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), material(course.background)); floor.rotation.x = -Math.PI / 2; floor.position.y = -.28; floor.receiveShadow = true; this.scenery.add(floor);
    for (let row = 0; row < 14; row++) for (let col = 0; col < 4; col++) box(this.scenery, palette[(row * 3 + col * 2 + row % 2) % palette.length], [(col - 1.5) * 3.15, -.025, 16 - row * 3.15], [3.11, .34, 3.11], .09);
    for (let z = -22; z < 18; z += 1.5) for (const x of [-6.42, 6.42]) box(this.scenery, 0xfffcf0, [x, .01, z], [.15, .22, .75], .06);
    for (let z = -18; z < 14; z += 1.9) { const mark = new THREE.Mesh(new THREE.CircleGeometry(.065, 10), material(0xfffaf1)); mark.rotation.x = -Math.PI / 2; mark.position.set(0, .151, z); this.scenery.add(mark); }
    floorLabel(this.scenery, 'START', '#fffdf4', 0, 15.4, 6); floorLabel(this.scenery, 'GOAL!', '#7a7892', 0, -22.7, 6);
    for (let col = 0; col < 16; col++) for (let row = 0; row < 2; row++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.77, .65), material((col + row) % 2 ? 0xfffbf1 : 0x9a8caf)); m.rotation.x = -Math.PI / 2; m.position.set(-5.78 + col * .77, .16, -20 + row * .65); this.scenery.add(m); }
    for (const x of [-6.1, 6.1]) { box(this.scenery, 0xfffcf1, [x, 2.2, -20.6], [.18, 4.2, .18], .08); ball(this.scenery, C.yellow, [x, 4.4, -20.6], [.23, .23, .23]); }
    tube(this.scenery, 0xbbb0d0, [new THREE.Vector3(-6, 4.2, -20.6), new THREE.Vector3(0, 3.6, -20.6), new THREE.Vector3(6, 4.2, -20.6)], .035);
    for (let i = 0; i < 11; i++) { const shape = new THREE.Shape(); shape.moveTo(-.35, 0); shape.lineTo(.35, 0); shape.lineTo(0, -.65); shape.closePath(); const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(palette[i % palette.length])); const x = -5.4 + i * 1.08; flag.position.set(x, 3.68 + Math.pow(x / 6, 2) * .45, -20.6); this.scenery.add(flag); }
    course.zones.forEach((zone, i) => this.buildZone(zone, i)); course.duckSpots.forEach(p => duck(this.scenery, p.x, p.z, .72));
    if (id === 'cloud') {
      for (let i = 0; i < 9; i++) { const x = (i % 2 ? -1 : 1) * (8.2 + i % 3 * .5); const z = 13 - i * 4.1; for (let p = 0; p < 3; p++) ball(this.scenery, 0xfffcfe, [x + (p - 1) * .55, .45 + (p === 1 ? .18 : 0), z], [.75, .45, .7]); if (i % 2 === 0) { const star = new THREE.Mesh(new THREE.OctahedronGeometry(.35), material(C.yellow)); star.position.set(x, 1.5, z); star.rotation.z = .25; this.scenery.add(star); } }
      floorLabel(this.scenery, 'CLOUD WALK', '#aaa5c0', -8, 6, 3.7);
    } else {
      duck(this.scenery, 8.5, 12, 1.2); toyRing(this.scenery, C.pink, -8.2, 8, .65); toyRing(this.scenery, C.mint, -8, 7.9, .4); toyRing(this.scenery, C.lilac, 8.2, -12, .9);
      for (let i = 0; i < (id === 'toybox' ? 7 : 3); i++) { const x = id === 'toybox' ? (i % 2 ? 8.4 : -8.4) : -8.6 + i * .15; const z = id === 'toybox' ? 7 - i * 4 : -2.5; for (let j = 0; j < i % 3 + 1; j++) { const cube = box(this.scenery, palette[(i + j) % palette.length], [x + j * .1, .4 + j * .8, z], [.85, .8, .85], .11); cube.rotation.y = j * .24; } }
      box(this.scenery, C.pink, [-8.7, .32, 15], [2.8, .8, 2], .32); box(this.scenery, C.lilac, [8.3, .28, -18], [2.5, .7, 2.5], .3);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 2.6, 12), material(0xe4be88)); pole.position.set(8, 1.2, -3.5); this.scenery.add(pole);
      for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.7 - i * .11, .15, 10, 28), material(palette[i])); ring.rotation.x = Math.PI / 2; ring.position.set(8, .18 + i * .35, -3.5); this.scenery.add(ring); } ball(this.scenery, C.yellow, [8, 2.25, -3.5], [.2, .2, .2]);
      if (id === 'toybox') { for (let i = 0; i < 4; i++) { box(this.scenery, palette[i], [8.3, .6, 8 - i * 1.65], [1, .8, 1.35], .15); for (const side of [-1, 1]) ball(this.scenery, 0x8f829c, [8.3 + side * .55, .3, 8 - i * 1.65], [.13, .22, .22]); } floorLabel(this.scenery, 'TOY PARADE', '#c294a0', -8, 12, 4); }
    }
    this.bakeScenery(); this.materialsNeedWarmup = true;
  }
  resize() { this.width = Math.max(1, this.container.clientWidth); this.height = Math.max(1, this.container.clientHeight); this.renderer.setSize(this.width, this.height); this.updateFrustum(); }
  private updateFrustum() { const aspect = this.width / this.height; this.camera.left = -this.viewHeight * aspect / 2; this.camera.right = this.viewHeight * aspect / 2; this.camera.top = this.viewHeight / 2; this.camera.bottom = -this.viewHeight / 2; this.camera.updateProjectionMatrix(); }
  worldPoint(clientX: number, clientY: number) { const rect = this.renderer.domElement.getBoundingClientRect(); this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera); const out = new THREE.Vector3(); return this.raycaster.ray.intersectPlane(this.ground, out); }
  screenPoint(x: number, y: number, z: number) { const p = new THREE.Vector3(x, y, z).project(this.camera); return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height, visible: p.z > -1 && p.z < 1 }; }
  /** One reusable result per original racer; no markers belong to doubles. */
  moodPoint(index: number) {
    const rig = this.babies[index], out = this.moodScreens[index];
    if (!rig || !out) return { x: 0, y: 0, visible: false };
    const height = rig.happenings.partyHair.visible ? 1.0 : rig.accessoryKind === 'bunny' ? 1.5 : rig.accessoryKind === 'crown' ? 1.15 : .82;
    rig.head.updateWorldMatrix(true, false);
    this.moodScratch.set(0, height, 0); rig.head.localToWorld(this.moodScratch); this.moodScratch.project(this.camera);
    out.x = (this.moodScratch.x + 1) / 2 * this.width; out.y = (1 - this.moodScratch.y) / 2 * this.height;
    out.visible = rig.root.visible && this.moodScratch.z > -1 && this.moodScratch.z < 1 && Math.abs(this.moodScratch.x) <= 1 && Math.abs(this.moodScratch.y) <= 1;
    return out;
  }
  confetti(x: number, z: number, count = 60) {
    if (this.reducedMotion) count = Math.min(count, 18);
    for (let i = 0; i < count; i++) { const mesh = new THREE.Mesh(confettiGeometry, material([C.mint, C.pink, C.yellow, C.lilac][i % 4])); mesh.position.set(x, 1.3, z); this.scene.add(mesh); this.effects.push({mesh, velocity: new THREE.Vector3((Math.random() - .5) * 5, 3 + Math.random() * 4, (Math.random() - .5) * 5), life: 3}); }
  }
  private applyStyle(index: number, style: BabyStyle) {
    const rig = this.babies[index]; const key = `${style.color}/${style.accessory}`; if (key === rig.styleKey) return; rig.styleKey = key;
    // Remove doubles without disposing their shared original geometry.
    rig.doubles.privateMaterials.forEach(mat => mat.dispose()); rig.ghosts.clear();
    const color = new THREE.Color(style.color).getHex(); rig.clothing.forEach(mesh => { mesh.material = material(color); }); clearObjects(rig.accessory); addAccessory(rig.accessory, style.accessory, color);
    rig.accessoryKind = style.accessory; rig.mouth.material = material(0xf2a9a5);
    rig.doubles = buildDoubles(rig.body, rig.head, rig.happenings, rig.ghosts);
    const rattle = this.rattles[index]; rattle.colored.forEach(mesh => { mesh.material = material(color); }); rattle.wave.material.color.setHex(color); rattle.range.material.color.setHex(color);
    rig.happenings.pacifierColors.forEach(mesh => { mesh.material = material(color); });
    this.materialsNeedWarmup = true;
  }
  private updateCamera(state: RaceState, dt: number, cinematic?: CinematicFrame | null) {
    const aspect = this.width / this.height;
    if (state.phase === 'ready') {
      const mobile = this.width < 760;
      this.desiredCamera.x = mobile ? 1.5 : -4.8; this.desiredCamera.y = mobile ? -5.3 : 0; this.desiredCamera.z = 10.5;
      this.desiredCamera.height = Math.max(mobile ? 17 : 14, 15.8 / aspect);
    } else fitRaceCamera(state.babies, aspect, this.desiredCamera);
    if (!this.cameraInitialized) { Object.assign(this.raceCamera, this.desiredCamera); this.cameraInitialized = true; }
    const baby = cinematic ? state.babies[cinematic.babyId] : undefined;
    if (cinematic && baby) {
      if (this.cutBabyId !== cinematic.babyId || this.cutEvent !== cinematic.eventId || cinematic.elapsed < this.cutElapsed) {
        Object.assign(this.savedCamera, this.raceCamera); this.savedRotation.copy(this.camera.quaternion);
        this.cutBabyId = cinematic.babyId; this.cutEvent = cinematic.eventId;
      }
      this.cutElapsed = cinematic.elapsed;
      const amount = THREE.MathUtils.clamp(cinematic.amount, 0, 1);
      let faceAngle = -baby.heading;
      // These two poses deliberately look over a shoulder; S08 faces the
      // audience. Only the camera changes, never the baby's simulation pose.
      if (cinematic.eventId === 'S03' || cinematic.eventId === 'S05') faceAngle += Math.PI * .8;
      else if (cinematic.eventId === 'S08') faceAngle = -2.87;
      else if (cinematic.eventId === 'R09') faceAngle -= .38;
      const frontX = -Math.sin(faceAngle), frontZ = -Math.cos(faceAngle);
      const partyWide = cinematic.eventId === 'S09' ? THREE.MathUtils.smoothstep(cinematic.elapsed, 1.2, 1.8) : 0;
      const closeY = cinematic.eventId === 'R02' ? .9 : cinematic.eventId === 'S09' ? THREE.MathUtils.lerp(1.65, 1.5, partyWide) : cinematic.eventId === 'R10' ? 1.35 : 1.15;
      this.closeTarget.set(baby.x + frontX * .15, closeY, baby.z + frontZ * .15);
      this.closeEye.set(this.closeTarget.x + frontX * 12, this.closeTarget.y + 4, this.closeTarget.z + frontZ * 12);
      this.closeMatrix.lookAt(this.closeEye, this.closeTarget, this.cameraUp); this.closeRotation.setFromRotationMatrix(this.closeMatrix);
      this.target.set(this.savedCamera.x, this.savedCamera.y, this.savedCamera.z).lerp(this.closeTarget, amount);
      this.camera.quaternion.copy(this.savedRotation).slerp(this.closeRotation, amount);
      const distance = THREE.MathUtils.lerp(this.cameraOffset.length(), Math.hypot(12, 4), amount);
      this.camera.position.set(0, 0, distance).applyQuaternion(this.camera.quaternion).add(this.target);
      const closeHeight = cinematic.eventId === 'S06' ? Math.max(3.8, 5.6 / aspect) : cinematic.eventId === 'S09' ? Math.max(THREE.MathUtils.lerp(3.0, 4.2, partyWide), THREE.MathUtils.lerp(2.65, 3.5, partyWide) / aspect)
        : cinematic.eventId === 'R10' ? Math.max(4.05, 3.35 / aspect) : cinematic.eventId === 'R09' ? Math.max(3.9, 3.25 / aspect) : Math.max(3.45, 2.65 / aspect);
      this.viewHeight = Math.exp(Math.log(this.savedCamera.height) + (Math.log(closeHeight) - Math.log(this.savedCamera.height)) * amount);
    } else {
      this.cutBabyId = -1; this.cutEvent = null; this.cutElapsed = 0;
      dampRaceCamera(this.raceCamera, this.desiredCamera, dt, this.reducedMotion);
      this.target.set(this.raceCamera.x, this.raceCamera.y, this.raceCamera.z); this.viewHeight = this.raceCamera.height;
      this.camera.position.copy(this.target).add(this.cameraOffset); this.camera.lookAt(this.target);
    }
    this.updateFrustum(); this.camera.updateMatrixWorld();
  }
  update(state: RaceState, elapsed: number, dt: number, cinematic?: CinematicFrame | null) {
    if (state.courseId !== this.courseId) this.buildCourse(state.courseId); const intro = state.phase === 'ready'; const mobile = this.width < 760;
    state.babies.forEach((b, i) => {
      const rig = this.babies[i]; if (!rig) return; this.applyStyle(i, b.style);
      // Keep nearby racers from covering the featured face during a closeup.
      // Restore everyone before the camera finishes returning to the race.
      rig.root.visible = !cinematic || cinematic.babyId === b.id || cinematic.amount <= .035;
      rig.root.scale.setScalar(intro && mobile ? 1.48 : 1.16);
      const preview = cinematic?.babyId === i ? cinematic : undefined;
      const presentation = rig.presentation;
      // A new race, another effect, or a restarted timer identifies a fresh
      // occurrence. Presentation memory never changes the simulation's timer.
      if (presentation.baby !== b || presentation.eventId !== b.eventId || b.stateTime > presentation.lastStateTime + 1e-6) {
        presentation.showcased = false; presentation.animationOffset = 0; presentation.cutElapsed = 0; presentation.inCut = false;
      }
      presentation.baby = b; presentation.eventId = b.eventId; presentation.lastStateTime = b.stateTime;
      if (preview && preview.eventId === b.eventId) {
        presentation.showcased = true; presentation.inCut = true; presentation.cutElapsed = preview.elapsed;
      } else if (presentation.inCut) {
        // Continue a crying/dancing pose at the exact phase shown in the final
        // cut frame instead of rewinding its cosmetic animation clock.
        presentation.animationOffset += presentation.cutElapsed; presentation.cutElapsed = 0; presentation.inCut = false;
      }
      // The R10 chorus also portrays the affected neighbours' lost pacifiers;
      // they must return still crying, without dropping them a second time.
      if (cinematic?.eventId === 'R10' && b.eventId === 'R10') presentation.showcased = true;
      const visualTime = elapsed + presentation.animationOffset + (preview?.elapsed ?? 0);
      rig.root.position.set(intro ? (i % 2 ? 3 : 0) : b.x, .04, intro ? 13 - Math.floor(i / 2) * 4 - i % 2 : b.z); rig.root.rotation.set(0, intro ? -2.65 + Math.sin(elapsed * .5 + i) * .08 : -b.heading, 0); this.animateBaby(rig, b, visualTime, intro, preview);
      const r = this.rattles[i]; const rattle = state.rattles[i]; r.root.visible = !intro && state.phase !== 'finished' && !cinematic; r.root.position.set(rattle.x, .85 + Math.sin(elapsed * 3 + i) * .06, rattle.z);
      r.toy.rotation.z = rattle.pulse > 0 && !this.reducedMotion ? Math.sin(elapsed * 60) * .3 : -.2; const pulse = Math.max(0, rattle.pulse); r.wave.visible = pulse > 0;
      r.wave.scale.setScalar(1 + (1 - Math.min(1, pulse / .5)) * 5); r.wave.material.opacity = Math.min(.6, pulse * 1.5); r.wave.position.y = .19 - r.root.position.y;
      r.range.visible = !b.isCpu; r.range.material.opacity = state.humanPlayers === 1 ? .075 : .035; r.range.position.y = .18 - r.root.position.y; r.range.scale.setScalar(b.zone === 'echo' ? 1.6 : 1);
    });
    for (const rig of this.babies) { rig.happenings.chorus.visible = false; rig.happenings.cryingCount = 0; }
    if (cinematic?.eventId === 'R10') {
      const rig = this.babies[cinematic.babyId], h = rig.happenings;
      let affected = 0;
      for (const baby of state.babies) if (baby.eventId === 'R10') affected++;
      h.cryingCount = affected; h.chorus.visible = affected > 1;
      let slot = 0;
      for (const baby of state.babies) {
        if (baby.id === cinematic.babyId || baby.eventId !== 'R10') continue;
        const portrait = h.cryBuddies[slot]; if (!portrait) break;
        portrait.root.visible = cinematic.elapsed >= .8 + slot * .23;
        portrait.root.position.set((slot - (affected - 2) / 2) * .88, 2.15 + Math.sin(cinematic.elapsed * 13 + slot) * .045, -.05);
        portrait.root.rotation.z = Math.sin(cinematic.elapsed * 12 + slot) * .08;
        if (portrait.slot !== baby.id || portrait.styleColor !== baby.style.color) { portrait.slot = baby.id; portrait.styleColor = baby.style.color; portrait.badge.material = material(new THREE.Color(baby.style.color).getHex()); }
        slot++;
      }
      for (; slot < h.cryBuddies.length; slot++) h.cryBuddies[slot].root.visible = false;
    }
    for (const b of this.rollingBalls) { const t = this.reducedMotion ? b.phase : elapsed * .85 + b.phase; b.root.position.set(b.x + Math.sin(t) * b.width, .58, b.z + Math.cos(t * .7) * Math.min(.25, b.depth * .08)); b.root.rotation.z = -Math.sin(t) * b.width / .4; b.root.rotation.x = t * .5; }
    if (!cinematic) for (let i = this.effects.length - 1; i >= 0; i--) { const fx = this.effects[i]; fx.life -= dt; fx.velocity.y -= dt * 4; fx.mesh.position.addScaledVector(fx.velocity, dt); fx.mesh.rotation.x += dt * 4; fx.mesh.rotation.z += dt * 3; if (fx.life < 0 || fx.mesh.position.y < .16) { this.scene.remove(fx.mesh); this.effects.splice(i, 1); } }
    this.updateCamera(state, dt, cinematic);
    if (this.materialsNeedWarmup && state.phase !== 'racing') { this.renderer.compile(this.scene, this.camera); this.materialsNeedWarmup = false; }
    this.renderer.render(this.scene, this.camera);
  }
  private animateBaby(rig: ReturnType<typeof buildBaby>, b: Baby, time: number, intro: boolean, preview?: CinematicFrame) {
    const event = intro ? null : preview?.eventId ?? b.eventId; const t = time * (b.state === 'groove' ? 14 : 8) + b.id * 2; const moving = intro || ['happy', 'groove', 'distracted', 'awakening'].includes(b.state); const motion = this.reducedMotion ? .35 : 1;
    rig.body.rotation.set(0, 0, 0); rig.body.position.set(0, moving ? Math.sin(t * 2) * .028 * motion : 0, 0); rig.head.rotation.set(b.state === 'rest' ? .12 : 0, b.state === 'look' ? Math.sin(time * 3) * .45 : Math.sin(time * 1.5) * .04, 0);
    rig.speedLines.visible = false; rig.ghosts.visible = event === 'S06';
    const h = rig.happenings;
    h.changing.visible = h.poop.visible = h.cleanStars.visible = h.cleanDiaper.visible = false;
    h.droppedPacifier.visible = h.tears.visible = false;
    h.makeup.visible = h.partyHair.visible = h.party.visible = event === 'S09';
    h.phase = '';
    rig.accessory.visible = event !== 'S09'; rig.pacifier.visible = event !== 'S09' && event !== 'R10';
    rig.mouth.visible = event !== 'S09'; rig.mouth.material = material(0xf2a9a5);
    for (const highlight of rig.eyeHighlights) highlight.visible = event !== 'R10';
    rig.eyes.forEach(eye => { eye.scale.y = .066; }); rig.eyebrows.forEach(brow => { brow.visible = false; }); rig.mouth.scale.set(.14, .09, .04); rig.mouth.rotation.z = 0;
    rig.limbs.forEach((limb, j) => { limb.rotation.set(moving ? Math.sin(t + (j % 3 === 0 ? 0 : Math.PI)) * .3 * motion : 0, 0, 0); });
    const sit = () => { rig.body.rotation.x = .42; rig.body.position.y = .08; rig.head.rotation.x = -.35; rig.limbs[1].rotation.x = -.65; rig.limbs[3].rotation.x = -.65; };
    const stand = (amount = 1) => { rig.body.rotation.x = .95 * amount; rig.body.position.y = .76 * amount; rig.head.rotation.x = -.95 * amount; };
    const fast = (pace: number, amount = .65) => rig.limbs.forEach((limb, j) => { limb.rotation.x = Math.sin(time * pace + (j < 2 ? 0 : Math.PI) + j % 2 * Math.PI) * amount * motion; });
    if (b.state === 'rest' || b.state === 'look') sit();
    switch (event) {
      case 'N01': rig.head.rotation.y = Math.sin(time * 2) * .7; rig.limbs[0].rotation.x = -.65; break;
      case 'N02': sit(); rig.head.rotation.y = Math.sin(time * 2.6) * .9; break;
      case 'N03': sit(); rig.body.position.y += Math.abs(Math.sin(time * 2)) * .025; break;
      case 'N04': rig.head.rotation.y = Math.sin(time * 1.5 + b.id) > 0 ? .9 : -.9; rig.limbs[2].rotation.z = -.7; break;
      case 'N05': sit(); rig.head.rotation.y = .95; rig.head.rotation.z = -.13; rig.eyes.forEach(eye => { eye.scale.y = .035; }); break;
      case 'N06': rig.body.rotation.z = Math.sin(time * 3.2) * .14 * motion; rig.head.rotation.y = Math.sin(time * 4) * .65; break;
      case 'N07': sit(); rig.limbs[0].rotation.set(-.7, 0, .85 + Math.sin(time * 12) * .15 * motion); rig.limbs[2].rotation.set(-.7, 0, -.85 - Math.sin(time * 12) * .15 * motion); break;
      case 'N08': { const sneeze = Math.pow(Math.max(0, Math.sin(time * 9)), 5); rig.head.rotation.x = sneeze * .6; rig.body.position.y = sneeze * .12 * motion; rig.eyes.forEach(eye => { eye.scale.y = .012; }); rig.mouth.scale.y = .14; break; }
      case 'R01': sit(); rig.limbs.forEach(limb => { limb.rotation.x = -.5; }); rig.speedLines.visible = true; break;
      case 'R02': rig.body.position.y = -.23; rig.body.rotation.x = -.14; rig.limbs[0].rotation.z = .5; rig.limbs[2].rotation.z = -.5; fast(19, .32); break;
      case 'R03': rig.head.rotation.y = Math.sin(time * 3 + b.id); rig.limbs[0].rotation.x = -.65; break;
      case 'R04': rig.body.position.y += Math.abs(Math.sin(time * 11)) * .15 * motion; rig.head.rotation.z = Math.sin(time * 7) * .1; rig.mouth.scale.y = .14; fast(20); break;
      case 'R05': sit(); rig.head.rotation.z = Math.sin(time * 10) * .13 * motion; rig.body.rotation.z = Math.sin(time * 8) * .08 * motion; rig.eyes.forEach(eye => { eye.scale.y = .021; }); rig.mouth.scale.set(.17, .14, .04); break;
      case 'R06': rig.root.rotation.y += this.reducedMotion ? Math.sin(time * 2) * .4 : time * 8; rig.limbs[0].rotation.z = .7; rig.limbs[2].rotation.z = -.7; break;
      case 'R07': rig.head.rotation.x = -.15; rig.head.rotation.y = Math.sin(time * 2) * .45; rig.limbs[2].rotation.x = -.8; break;
      case 'R08': rig.body.rotation.x = -.1; rig.head.rotation.x = .08; fast(17, .4); rig.eyebrows.forEach((brow, i) => { brow.visible = true; brow.rotation.z = i ? .2 : -.2; }); break;
      case 'R09': {
        const duration = b.z < -16 ? .65 : 3;
        const progress = preview ? THREE.MathUtils.clamp(preview.elapsed / preview.duration, 0, 1) : rig.presentation.showcased ? 1 : THREE.MathUtils.clamp(1 - b.stateTime / duration, 0, 1);
        sit(); rig.head.rotation.z = Math.sin(time * 3) * .06 * motion;
        h.phase = progress < .2 ? 'surprise' : progress < .62 ? 'wipe' : progress < .84 ? 'fresh-diaper' : 'clean';
        h.poop.visible = progress < .28; h.poop.rotation.z = Math.sin(time * 5) * .1 * motion;
        h.changing.visible = progress >= .16; h.wipes.visible = progress < .88;
        h.wipe.visible = progress >= .25 && progress < .66;
        h.wipe.position.set(.42 + Math.sin(time * 13) * .28 * motion, .88, .56 + Math.cos(time * 13) * .18 * motion); h.wipe.rotation.z = -.2 + Math.sin(time * 13) * .1;
        const change = THREE.MathUtils.smoothstep(progress, .6, .81);
        h.freshDiaper.visible = progress >= .48 && progress < .84;
        h.freshDiaper.position.set(-.78 * (1 - change), .4 + change * .2, .65); h.freshDiaper.rotation.z = -.12 * (1 - change);
        h.cleanDiaper.visible = progress >= .73; h.cleanStars.visible = progress >= .73;
        h.cleanStars.rotation.y = time * .65;
        rig.limbs[0].rotation.set(-.8, 0, .6); rig.limbs[2].rotation.set(-.8, 0, -.6);
        rig.limbs[1].rotation.x = -.8 + Math.sin(time * 8) * .14 * motion; rig.limbs[3].rotation.x = -.8 - Math.sin(time * 8) * .14 * motion;
        break;
      }
      case 'R10': {
        const progress = preview ? THREE.MathUtils.clamp(preview.elapsed / preview.duration, 0, 1) : THREE.MathUtils.clamp(1 - b.stateTime / 2.2, 0, 1);
        const drop = !preview && rig.presentation.showcased ? 1 : THREE.MathUtils.smoothstep(progress, 0, .22);
        sit(); h.phase = drop < .99 ? 'pacifier-falling' : 'crying'; h.droppedPacifier.visible = true; h.tears.visible = true;
        h.droppedPacifier.position.set(.12 + drop * .22, 1.0 - drop * .76 + (drop > .98 ? Math.abs(Math.sin(time * 9)) * .025 * motion : 0), -.82 - drop * .26);
        h.droppedPacifier.rotation.set(drop * 2.1, 0, drop * .8);
        rig.mouth.material = material(0x67414d); rig.mouth.scale.set(.17, .19, .06);
        rig.eyes.forEach(eye => { eye.scale.y = .018; });
        rig.eyebrows.forEach((brow, i) => { brow.visible = true; brow.rotation.z = i ? -.32 : .32; });
        rig.head.rotation.z = Math.sin(time * 15) * .09 * motion; rig.body.position.y += Math.abs(Math.sin(time * 16)) * .05 * motion;
        rig.limbs[0].rotation.set(-.9 + Math.sin(time * 18) * .45 * motion, 0, .7); rig.limbs[2].rotation.set(-.9 - Math.sin(time * 18) * .45 * motion, 0, -.7);
        rig.limbs[1].rotation.x = -.6 + Math.sin(time * 20) * .4 * motion; rig.limbs[3].rotation.x = -.6 - Math.sin(time * 20) * .4 * motion;
        for (let i = 0; i < h.tearDrops.length; i++) { const fall = (time * 1.5 + Math.floor(i / 2) * .5) % 1; h.tearDrops[i].position.set((i % 2 ? 1 : -1) * (.28 + fall * .12), .035 - fall * .7, -.54 + fall * .06); h.tearDrops[i].scale.setScalar(.8 + Math.sin(fall * Math.PI) * .3); }
        break;
      }
      case 'S01': {
        // The race's pose timer is deliberately frozen during a cut. Preview
        // the rise, pose and run locally, without writing to the Baby object.
        const progress = preview ? THREE.MathUtils.clamp(preview.elapsed / preview.duration, 0, 1) : 0;
        const phase = preview ? progress < .44 ? 'pose' : progress < .84 ? 'run' : 'landing' : b.awakeningPhase;
        const rise = preview ? phase === 'pose' ? THREE.MathUtils.smoothstep(progress, .08, .24) : phase === 'landing' ? 1 - THREE.MathUtils.smoothstep(progress, .84, 1) : 1 : phase === 'pose' ? THREE.MathUtils.clamp((3.95 - b.stateTime) / .65, 0, 1) : phase === 'landing' ? b.stateTime / .3 : 1;
        stand(rise); if (phase === 'pose') { rig.limbs[0].rotation.set(-.6, 0, -1.5); rig.limbs[2].rotation.set(.5, 0, -.7); } else { fast(23); rig.speedLines.visible = phase === 'run'; } break;
      }
      case 'S02': stand(.78); rig.head.rotation.y = Math.round(Math.sin(time * 2) * 1.5) * .3; rig.limbs.forEach((limb, j) => { limb.rotation.x = Math.sign(Math.sin(time * 9 + j * Math.PI)) * .45 * motion; limb.rotation.z = j % 2 ? 0 : (j ? -.5 : .5); }); break;
      case 'S03': stand(); rig.body.rotation.z = Math.sin(time * 4) * .16 * motion; rig.head.rotation.z = -.17; rig.head.rotation.y = Math.PI * .8; rig.limbs[0].rotation.z = .8; rig.limbs[2].rotation.z = -.8; rig.limbs[1].rotation.x = Math.sin(time * 7) * .45; rig.limbs[3].rotation.x = -Math.sin(time * 7) * .45; break;
      case 'S04': rig.body.position.y = -.18; rig.body.rotation.z = Math.sin(time * 10) * .18 * motion; rig.limbs[0].rotation.x = .9; rig.limbs[2].rotation.x = .9; rig.limbs[1].rotation.x = Math.sin(time * 25) * .55; rig.limbs[3].rotation.x = -Math.sin(time * 25) * .55; rig.speedLines.visible = true; break;
      case 'S05': rig.head.rotation.y = Math.PI * .8; rig.body.rotation.z = Math.sin(time * 7) * .08; fast(19, .4); rig.speedLines.visible = true; rig.speedLines.rotation.y = Math.PI; break;
      case 'S06': fast(18, .4); rig.body.rotation.z = Math.sin(time * 12) * .08 * motion; break;
      case 'S07': sit(); rig.body.rotation.z = Math.sin(time * 5) * .22 * motion; rig.root.rotation.y += Math.sin(time * 2.5) * .6 * motion; rig.limbs[0].rotation.z = .9; rig.limbs[2].rotation.z = -.9; rig.speedLines.visible = true; break;
      case 'S08': sit(); rig.root.rotation.y = -2.65; rig.head.rotation.z = -.24; rig.head.rotation.y = -.22; rig.limbs[0].rotation.set(-.8, 0, 1.1); rig.limbs[2].rotation.set(.2, 0, -.9); rig.eyes.forEach(eye => { eye.scale.y = .026; }); rig.mouth.rotation.z = -.3; rig.mouth.scale.set(.16, .045, .04); rig.eyebrows.forEach((brow, i) => { brow.visible = true; brow.rotation.z = i ? -.2 : .2; }); break;
      case 'S09': {
        const running = !preview && b.awakeningPhase === 'run';
        stand(.92); h.phase = running ? 'gyaru-dash' : 'para-para';
        rig.head.rotation.z = Math.sin(time * 5) * .075 * motion; rig.head.rotation.y = Math.sin(time * 3) * .08;
        if (running) { fast(24, .6); rig.speedLines.visible = true; h.party.visible = false; }
        else {
          const beat = Math.sin(time * 8), alternate = Math.sin(time * 8 + Math.PI / 2);
          rig.body.rotation.z = beat * .12 * motion;
          rig.limbs[0].rotation.set(-1.1 + alternate * .5 * motion, 0, .9 + beat * .7 * motion);
          rig.limbs[2].rotation.set(-1.1 - alternate * .5 * motion, 0, -.9 + beat * .7 * motion);
          rig.limbs[1].rotation.x = beat * .28 * motion; rig.limbs[3].rotation.x = -beat * .28 * motion;
          rig.body.position.y += Math.abs(beat) * .07 * motion;
          h.disco.rotation.y = time * .9 * motion;
          for (let i = 0; i < h.partyStars.length; i++) { h.partyStars[i].rotation.z = time * .7 + i; h.partyStars[i].scale.setScalar(.7 + Math.sin(time * 9 + i * 2) * .28 * motion); }
        }
        break;
      }
    }
    if (event !== 'S05') rig.speedLines.rotation.y = 0;
    if (!event && b.state === 'awakening') { stand(); fast(23); rig.speedLines.visible = b.awakeningPhase === 'run'; }
    if (rig.ghosts.visible) for (const double of rig.doubles.copies) for (const part of double.parts) {
      part.copy.position.copy(part.source.position); part.copy.quaternion.copy(part.source.quaternion); part.copy.scale.copy(part.source.scale); part.copy.visible = part.source.visible;
    }
  }
  /** Read-only snapshots for QA; taking one never changes the scene or rules. */
  getHappeningDiagnostics() {
    return this.babies.map((rig, babyId) => ({
      babyId, visible: rig.root.visible, phase: rig.happenings.phase,
      showcased: rig.presentation.showcased,
      cloneCount: rig.doubles.copies.length,
      visibleClones: rig.root.visible && rig.ghosts.visible ? rig.doubles.copies.length : 0,
      cloneHeads: rig.doubles.copies.map(double => {
        double.head.getWorldPosition(this.moodScratch); this.moodScratch.project(this.camera);
        return { x: (this.moodScratch.x + 1) / 2 * this.width, y: (1 - this.moodScratch.y) / 2 * this.height, opacity: .56,
          visible: rig.root.visible && rig.ghosts.visible && Math.abs(this.moodScratch.x) <= 1 && Math.abs(this.moodScratch.y) <= 1 };
      }),
      makeup: rig.happenings.makeup.visible, partyHair: rig.happenings.partyHair.visible,
      accessoryVisible: rig.accessory.visible, pacifierVisible: rig.pacifier.visible,
      pacifierDropped: rig.happenings.droppedPacifier.visible, tears: rig.happenings.tears.visible,
      pacifierOnFloor: rig.happenings.droppedPacifier.visible && rig.happenings.phase === 'crying',
      cryingCount: rig.happenings.cryingCount,
      cryingPortraits: rig.happenings.chorus.visible ? rig.happenings.cryBuddies.filter(p => p.root.visible).length : 0,
      diaperStage: rig.happenings.phase === 'surprise' || rig.happenings.changing.visible ? rig.happenings.phase : null,
      changingMat: rig.happenings.changing.visible, cleanDiaper: rig.happenings.cleanDiaper.visible,
      discoBall: rig.happenings.party.visible,
    }));
  }
  dispose() {
    clearObjects(this.scenery); clearObjects(this.movingScenery); const geometries = new Set<THREE.BufferGeometry>(); const ownedMaterials = new Set<THREE.Material>();
    this.scene.traverse(obj => { if (obj instanceof THREE.Mesh) { geometries.add(obj.geometry); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(m => ownedMaterials.add(m)); } });
    geometries.add(sphere); geometries.add(confettiGeometry); geometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); materials.forEach(m => m.dispose()); materials.clear(); this.renderer.dispose(); this.renderer.domElement.remove(); this.effects.length = 0;
  }
}
