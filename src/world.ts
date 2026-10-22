import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DUCK_SPOTS, type RaceState, type Baby } from './simulation';

const C = { cream: 0xf9f5e9, mint: 0xa6d7c8, pink: 0xeab7bb, yellow: 0xf4d68c, lilac: 0xc5bcdf, blue: 0xb6d9e4, ink: 0x514e55, skin: 0xf4c9a6 };
const sphere = new THREE.SphereGeometry(1, 24, 16);
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
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, radius, 8, false), material(color));
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function labelTexture(text: string, color: string, width = 768, height = 192) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.font = '900 100px "Zen Maru Gothic", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function floorLabel(parent: THREE.Object3D, text: string, color: string, x: number, z: number, w = 5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: labelTexture(text, color), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .177, z); parent.add(m);
}
function duck(parent: THREE.Object3D, x: number, z: number, size = 1) {
  const g = new THREE.Group(); g.position.set(x, .18, z); g.scale.setScalar(size);
  ball(g, 0xf1cd67, [0, .26, 0], [.45, .32, .52]);
  ball(g, 0xf9d878, [0, .65, -.22], [.31, .34, .31]);
  ball(g, 0xeaa05a, [0, .58, -.53], [.23, .09, .16]);
  ball(g, C.ink, [-.21, .72, -.43], [.034, .049, .034]);
  ball(g, C.ink, [.21, .72, -.43], [.034, .049, .034]);
  ball(g, 0xfbe9ab, [-.36, .28, .03], [.08, .17, .29]); parent.add(g); return g;
}
function toyRing(parent: THREE.Object3D, color: number, x: number, z: number, r: number) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, .13, 12, 36), material(color));
  m.rotation.x = Math.PI / 2; m.position.set(x, .35, z); m.castShadow = true; parent.add(m); return m;
}
function buildBaby(color: number, skin: number) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  ball(body, color, [0, .66, .25], [.48, .39, .64]);
  ball(body, 0xfffaf1, [0, .6, .62], [.47, .36, .34]);
  const head = new THREE.Group(); head.position.set(0, 1.01, -.39); body.add(head);
  ball(head, skin, [0, 0, 0], [.59, .58, .56]);
  ball(head, skin, [-.57, -.03, -.02], [.12, .17, .12]);
  ball(head, skin, [.57, -.03, -.02], [.12, .17, .12]);
  for (const side of [-1, 1]) {
    ball(head, C.ink, [side * .22, .055, -.513], [.045, .066, .027]);
    ball(head, 0xfffcf1, [side * .22 - .009, .077, -.538], [.012, .018, .009]);
    ball(head, 0xecaaa0, [side * .36, -.13, -.43], [.105, .055, .018]);
  }
  ball(head, skin, [0, -.065, -.561], [.085, .065, .052]);
  ball(head, 0xf2a9a5, [0, -.22, -.509], [.14, .09, .04]);
  const pacifier = new THREE.Mesh(new THREE.TorusGeometry(.071, .026, 8, 20), material(color));
  pacifier.position.set(0, -.23, -.577); head.add(pacifier);
  tube(head, 0x9c775c, [new THREE.Vector3(0, .52, -.1), new THREE.Vector3(-.08, .67, -.03), new THREE.Vector3(.08, .69, .01), new THREE.Vector3(.14, .61, -.02)], .037);
  const limbs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .43, .69, -.22); body.add(arm);
    ball(arm, color, [side * .04, -.06, 0], [.18, .19, .2]);
    ball(arm, skin, [side * .06, -.27, -.13], [.14, .27, .15]);
    ball(arm, skin, [side * .07, -.45, -.2], [.19, .10, .19]); limbs.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .34, .51, .65); body.add(leg);
    ball(leg, skin, [side * .1, -.12, .03], [.22, .24, .23]);
    ball(leg, skin, [side * .14, -.28, .19], [.14, .13, .24]); limbs.push(leg);
  }
  for (let i = 0; i < 3; i++) ball(body, 0xf8f6ed, [0, .94, -.02 + i * .2], [.04, .018, .04]);
  const speedLines = new THREE.Group();
  for (let i = 0; i < 3; i++) box(speedLines, 0xfffbef, [(i - 1) * .5, .14, 1.2 + (i % 2) * .35], [.045, .035, .8 + (i % 2) * .5], .015);
  root.add(speedLines); speedLines.visible = false;
  return { root, body, head, limbs, speedLines };
}
function buildRattle(color: number) {
  const root = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .54, 4, 12), material(color));
  handle.position.y = .25; root.add(handle);
  ball(root, color, [0, .8, 0], [.35, .35, .35]);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(.347, .043, 8, 28), material(0xfff8e6));
  stripe.position.y = .8; stripe.rotation.x = Math.PI / 2; root.add(stripe);
  ball(root, 0xfff9e9, [-.12, .93, .27], [.065, .065, .025]);
  const wave = new THREE.Mesh(new THREE.RingGeometry(.4, .44, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2; wave.position.y = -.5; root.add(wave);
  const range = new THREE.Mesh(new THREE.RingGeometry(2.8, 2.82, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .18, side: THREE.DoubleSide, depthWrite: false }));
  range.rotation.x = -Math.PI / 2; range.position.y = -.51; root.add(range);
  return { root, wave, range };
}

export class GameWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 180);
  babies = [buildBaby(0x8ec8b9, C.skin), buildBaby(0xc0afe0, 0xf2c7a6)];
  rattles = [buildRattle(0x78b8a4), buildRattle(0xb09aca)];
  raycaster = new THREE.Raycaster();
  ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.2);
  target = new THREE.Vector3(1, 0, 10);
  viewHeight = 13;
  width = 1; height = 1;
  effects: {mesh: THREE.Mesh, velocity: THREE.Vector3, life: number}[] = [];
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(public container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor(C.cream);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute('aria-label', '赤ちゃんとガラガラが走る3Dプレイマット');
    this.renderer.domElement.id = 'game-canvas'; container.prepend(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(C.cream, 55, 110);
    this.scene.add(new THREE.HemisphereLight(0xfffcf3, 0xc6b5c3, 2.6));
    const sun = new THREE.DirectionalLight(0xfff6e7, 3.3); sun.position.set(-10, 22, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28; sun.shadow.camera.far = 65;
    sun.shadow.normalBias = .035; sun.shadow.bias = -.0001; sun.shadow.radius = 5; this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), material(C.cream)); floor.rotation.x = -Math.PI / 2; floor.position.y = -.28; floor.receiveShadow = true; this.scene.add(floor);
    this.buildCourse();
    this.bakeScenery();
    this.babies.forEach(b => { b.root.scale.setScalar(1.16); this.scene.add(b.root); });
    this.rattles.forEach(r => this.scene.add(r.root));
    this.resize();
  }
  bakeScenery() {
    // Merge stationary toys and mat pieces by material; articulated babies stay separate.
    this.scene.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    this.scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial)) return;
      const batch = batches.get(obj.material) ?? []; batch.push(obj); batches.set(obj.material, batch);
    });
    batches.forEach((meshes, mat) => {
      const geometries = meshes.map(mesh => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrixWorld);
      });
      const geometry = mergeGeometries(geometries);
      if (geometry) {
        meshes.forEach(mesh => mesh.removeFromParent());
        const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
      }
      geometries.forEach(g => g.dispose());
    });
  }
  buildCourse() {
    const palette = [0xbee0d5, 0xd8d0e8, 0xf6e2af, 0xf0cccb, 0xc8e0e7, 0xefe6cd];
    for (let row = 0; row < 14; row++) {
      for (let col = 0; col < 4; col++) {
        const color = palette[(row * 3 + col * 2 + (row % 2)) % palette.length];
        box(this.scene, color, [(col - 1.5) * 3.15, -.025, 16 - row * 3.15], [3.11, .34, 3.11], .09);
      }
    }
    for (let z = -22; z < 18; z += 1.5) {
      for (const x of [-6.42, 6.42]) box(this.scene, 0xfffcf0, [x, .01, z], [.15, .22, .75], .06);
    }
    // A quiet dotted centre line leaves both babies free to roam.
    for (let z = -18; z < 14; z += 1.9) {
      const mark = new THREE.Mesh(new THREE.CircleGeometry(.065, 12), material(0xfffaf1));
      mark.rotation.x = -Math.PI / 2; mark.position.set(0, .151, z); this.scene.add(mark);
    }
    floorLabel(this.scene, 'START', '#fffdf4', 0, 15.4, 6);
    floorLabel(this.scene, 'GOAL!', '#7a7892', 0, -22.7, 6);
    for (let col = 0; col < 16; col++) for (let row = 0; row < 2; row++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.77, .65), material((col + row) % 2 ? 0xfffbf1 : 0x9a8caf));
      m.rotation.x = -Math.PI / 2; m.position.set(-5.78 + col * .77, .16, -20 + row * .65); this.scene.add(m);
    }
    for (const x of [-6.1, 6.1]) {
      box(this.scene, 0xfffcf1, [x, 2.2, -20.6], [.18, 4.2, .18], .08);
      ball(this.scene, C.yellow, [x, 4.4, -20.6], [.23, .23, .23]);
    }
    tube(this.scene, 0xbbb0d0, [new THREE.Vector3(-6, 4.2, -20.6), new THREE.Vector3(0, 3.6, -20.6), new THREE.Vector3(6, 4.2, -20.6)], .035);
    for (let i = 0; i < 11; i++) {
      const shape = new THREE.Shape(); shape.moveTo(-.35, 0); shape.lineTo(.35, 0); shape.lineTo(0, -.65); shape.closePath();
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: palette[i % 6], side: THREE.DoubleSide, roughness: .9 }));
      const x = -5.4 + i * 1.08; flag.position.set(x, 3.68 + Math.pow(x / 6, 2) * .45, -20.6); this.scene.add(flag);
    }
    DUCK_SPOTS.forEach(p => duck(this.scene, p.x, p.z, .85));
    duck(this.scene, 8.5, 12, 1.25);
    toyRing(this.scene, C.pink, -8.2, 8, .65); toyRing(this.scene, C.mint, -8, 7.9, .4);
    toyRing(this.scene, C.lilac, 8.2, -12, .9);
    for (let i = 0; i < 3; i++) {
      const cube = box(this.scene, [C.yellow, C.mint, C.pink][i], [-8.6 + i * .15, .4 + i * .8, -2.5], [.85, .8, .85], .11);
      cube.rotation.y = i * .24;
    }
    for (const [x, z, color] of [[8, 2, C.pink], [-8, -14, C.blue], [9, 8, C.yellow]] as number[][]) {
      ball(this.scene, color, [x, .5, z], [.65, .65, .65]);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(.648, .025, 8, 32), material(0xfff9ec)); stripe.position.set(x, .5, z); stripe.rotation.x = .7; this.scene.add(stripe);
    }
    // A stacking toy, a low cushion, and a little toy house frame the nursery.
    box(this.scene, C.pink, [-8.7, .32, 15], [2.8, .8, 2], .32);
    box(this.scene, C.lilac, [8.3, .28, -18], [2.5, .7, 2.5], .3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 2.6, 12), material(0xe4be88)); pole.position.set(8, 1.2, -3.5); this.scene.add(pole);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.7 - i * .11, .15, 12, 30), material(palette[i])); ring.rotation.x = Math.PI / 2; ring.position.set(8, .18 + i * .35, -3.5); ring.castShadow = true; this.scene.add(ring);
    }
    ball(this.scene, C.yellow, [8, 2.25, -3.5], [.2, .2, .2]);
  }
  resize() {
    this.width = this.container.clientWidth; this.height = this.container.clientHeight;
    this.renderer.setSize(this.width, this.height); this.updateFrustum();
  }
  updateFrustum() {
    const aspect = this.width / this.height;
    const h = Math.max(this.viewHeight, 17 / aspect);
    this.camera.left = -h * aspect / 2; this.camera.right = h * aspect / 2;
    this.camera.top = h / 2; this.camera.bottom = -h / 2; this.camera.updateProjectionMatrix();
  }
  worldPoint(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const out = new THREE.Vector3(); return this.raycaster.ray.intersectPlane(this.ground, out);
  }
  screenPoint(x: number, y: number, z: number) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height, visible: p.z > -1 && p.z < 1 };
  }
  confetti(x: number, z: number, count = 60) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.1, .18), material([C.mint, C.pink, C.yellow, C.lilac][i % 4]));
      mesh.position.set(x, 1.3, z); this.scene.add(mesh);
      this.effects.push({mesh, velocity: new THREE.Vector3((Math.random() - .5) * 5, 3 + Math.random() * 4, (Math.random() - .5) * 5), life: 3});
    }
  }
  update(state: RaceState, elapsed: number, dt: number) {
    const intro = state.phase === 'ready';
    let desired = new THREE.Vector3();
    if (intro) { desired.set(-2.7, 0, 11); this.viewHeight = this.width < 760 ? 18 : 11.7; }
    else {
      const zs = state.babies.map(b => b.z); const spread = Math.max(...zs) - Math.min(...zs);
      desired.set(0, 0, (Math.max(...zs) + Math.min(...zs)) / 2 - 3.6);
      this.viewHeight = Math.max(Math.max(...zs) < -13 ? 13.5 : 15.5, 12.8 + spread * .83);
    }
    this.target.lerp(desired, intro ? .055 : 1 - Math.exp(-dt * 3));
    this.updateFrustum(); this.camera.position.copy(this.target).add(new THREE.Vector3(13, 20, 23)); this.camera.lookAt(this.target);
    state.babies.forEach((b, i) => {
      const rig = this.babies[i];
      rig.root.scale.setScalar(intro && this.width < 760 ? 1.65 : 1.16);
      rig.root.position.set(intro ? (i ? 3 : -.8) : b.x, .04, intro ? (i ? 9.4 : 12) : b.z);
      rig.root.rotation.y = intro ? -2.7 + Math.sin(elapsed * .5 + i) * .08 : -b.heading;
      this.animateBaby(rig, b, elapsed, intro);
      const r = this.rattles[i]; const rattle = state.rattles[i];
      r.root.visible = !intro && state.phase !== 'finished';
      r.root.position.set(rattle.x, .85 + Math.sin(elapsed * 3 + i) * .06, rattle.z);
      r.root.rotation.z = rattle.pulse > 0 ? Math.sin(elapsed * 60) * .3 : -.2;
      const pulse = Math.max(0, rattle.pulse);
      r.wave.visible = pulse > 0;
      r.wave.scale.setScalar(1 + (1 - Math.min(1, pulse / .5)) * 5);
      (r.wave.material as THREE.MeshBasicMaterial).opacity = Math.min(.6, pulse * 1.5);
      r.range.visible = i === 0;
    });
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]; fx.life -= dt; fx.velocity.y -= dt * 4;
      fx.mesh.position.addScaledVector(fx.velocity, dt); fx.mesh.rotation.x += dt * 4; fx.mesh.rotation.z += dt * 3;
      if (fx.life < 0 || fx.mesh.position.y < .16) { this.scene.remove(fx.mesh); fx.mesh.geometry.dispose(); this.effects.splice(i, 1); }
    }
    this.renderer.render(this.scene, this.camera);
  }
  animateBaby(rig: ReturnType<typeof buildBaby>, b: Baby, time: number, intro: boolean) {
    const t = time * (b.state === 'groove' ? 14 : 8) + b.id * 2;
    const moving = intro || ['happy', 'groove', 'distracted', 'awakening'].includes(b.state);
    const standing = b.state === 'awakening';
    const sliding = b.state === 'groove' && b.event === 'おしりジェット！';
    rig.speedLines.visible = !intro && ((standing && b.awakeningPhase === 'run') || sliding);
    rig.body.rotation.set(0, 0, 0); rig.body.position.y = moving ? Math.sin(t * 2) * .028 : 0;
    rig.head.rotation.y = b.state === 'look' ? Math.sin(time * 3) * .45 : Math.sin(time * 1.5) * .04;
    rig.head.rotation.x = b.state === 'rest' ? .12 : 0;
    rig.limbs.forEach((limb, j) => { limb.rotation.x = moving ? Math.sin(t + (j % 3 === 0 ? 0 : Math.PI)) * .3 : 0; limb.rotation.z = 0; });
    if (b.state === 'rest' || b.state === 'look') {
      rig.body.rotation.x = .38; rig.body.position.y = .08; rig.head.rotation.x = -.3;
      rig.limbs[1].rotation.x = -.65; rig.limbs[3].rotation.x = -.65;
    }
    if (sliding) {
      rig.body.rotation.x = .42; rig.body.position.y = .08; rig.head.rotation.x = -.35;
      rig.limbs.forEach(limb => limb.rotation.x = -.5);
    }
    if (standing) {
      const rise = b.awakeningPhase === 'pose' ? THREE.MathUtils.clamp((3.95 - b.stateTime) / .65, 0, 1) : b.awakeningPhase === 'landing' ? b.stateTime / .3 : 1;
      rig.body.rotation.x = rise; rig.body.position.y = .8 * rise;
      rig.head.rotation.x = -rise;
      if (b.awakeningPhase === 'pose') {
        rig.limbs[0].rotation.z = -1.5; rig.limbs[2].rotation.z = -.7;
        rig.limbs[0].rotation.x = -.6; rig.limbs[2].rotation.x = .5;
      } else rig.limbs.forEach((limb, j) => { limb.rotation.x = Math.sin(time * 23 + j * Math.PI) * .7; });
    }
  }
  dispose() {
    this.scene.traverse(obj => { if (obj instanceof THREE.Mesh) obj.geometry.dispose(); });
    materials.forEach(m => m.dispose()); this.renderer.dispose();
  }
}
