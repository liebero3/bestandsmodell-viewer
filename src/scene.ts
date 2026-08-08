/**
 * Three.js-Grundgerüst: Renderer, Kamera, Licht, Bodenraster, Steuerung,
 * Ansichts-Presets und Render-on-demand-Schleife.
 *
 * Koordinatensystem: Z-UP wie im FreeCAD-Modell.
 *   +X = Osten, -X = Westen, +Y = Norden, -Y = Süden, +Z = oben.
 * Die Wurzelgruppe `ctx.root` skaliert Millimeter auf Meter (0.001);
 * innerhalb von `root` wird also weiterhin in Projekt-Millimetern gerechnet.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clearDirty, ctx, isDirty } from './state.ts';

/** Millimeter -> Meter. */
export const MM_TO_M = 0.001;

/** Ansichtsrichtungen der Preset-Schaltflächen. */
export type ViewName = 'sued' | 'west' | 'nord' | 'ost' | 'iso' | 'oben';

const VIEW_LABELS: Array<{ id: ViewName; label: string; title: string }> = [
  { id: 'sued', label: 'Süd', title: 'Ansicht von Süden (Blick nach Norden)' },
  { id: 'west', label: 'West', title: 'Ansicht von Westen (Blick nach Osten)' },
  { id: 'nord', label: 'Nord', title: 'Ansicht von Norden (Blick nach Süden)' },
  { id: 'ost', label: 'Ost', title: 'Ansicht von Osten (Blick nach Westen)' },
  { id: 'iso', label: 'Iso', title: 'Schräge Übersicht von Südwesten' },
  { id: 'oben', label: 'Oben', title: 'Draufsicht (Norden oben)' },
];

/** Blickrichtungs-Einheitsvektoren (Kameraposition relativ zum Zielpunkt). */
const VIEW_DIRS: Record<ViewName, THREE.Vector3> = {
  sued: new THREE.Vector3(0, -1, 0.001),
  west: new THREE.Vector3(-1, 0, 0.001),
  nord: new THREE.Vector3(0, 1, 0.001),
  ost: new THREE.Vector3(1, 0, 0.001),
  iso: new THREE.Vector3(-0.78, -1, 0.62),
  oben: new THREE.Vector3(0, 0.0008, 1),
};

let viewportEl: HTMLElement;
let canvasEl: HTMLCanvasElement;
let hudEl: HTMLElement | null = null;
let activeView: ViewName | null = 'iso';

/** Zuletzt eingepasste Modellhülle in Metern (Weltkoordinaten). */
const modelBox = new THREE.Box3();

/**
 * Baut Renderer, Szene, Kamera, Licht und Steuerung auf und startet die
 * Renderschleife. Muss vor jedem anderen Modul laufen.
 */
export function initScene(): void {
  viewportEl = requireEl('viewport');
  canvasEl = requireEl('view-canvas') as HTMLCanvasElement;
  hudEl = document.getElementById('view-hud');

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: true, // der helle Verlauf kommt aus dem CSS des Viewports
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.localClippingEnabled = true; // für die Schnittebenen (clipping.ts)
  ctx.renderer = renderer;

  // --- Szene ---
  const scene = new THREE.Scene();
  scene.background = null;
  ctx.scene = scene;

  // --- Z-UP durchgängig ---
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(-16, -20, 13);
  ctx.camera = camera;

  // --- Wurzelgruppe: Millimeter -> Meter ---
  const root = new THREE.Group();
  root.name = 'root';
  root.scale.setScalar(MM_TO_M);
  scene.add(root);
  ctx.root = root;

  // --- Licht ---
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 2.1);
  hemi.position.set(0, 0, 1);
  scene.add(hemi);

  // Hauptlicht aus Südwesten oben (entspricht der Startansicht),
  // Aufhelllicht aus Nordosten gegen vollständig schwarze Rückseiten.
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(-14, -18, 22);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.75);
  fillLight.position.set(16, 14, 8);
  scene.add(fillLight);

  // Mitlaufendes Kameralicht: im Schnitt schaut man auf Rückseiten (Material
  // ist DoubleSide), deren Normalen von den festen Lichtern wegzeigen. Ohne
  // dieses Licht bleiben Dach- und Deckenunterseiten fast schwarz.
  const camLight = new THREE.DirectionalLight(0xffffff, 0.7);
  camLight.position.set(0, 0, 1); // relativ zur Kamera: direkt nach vorn
  camera.add(camLight);
  scene.add(camera);

  // --- Bodenraster (dezent, 1-m-Teilung, 5-m-Hauptlinien) ---
  scene.add(buildGroundGrid());

  // --- Steuerung ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.minDistance = 1.5;
  controls.maxDistance = 260;
  controls.target.set(5.24, 4.93, 3.5);
  controls.update();
  ctx.controls = controls;

  // Der Viewer zeichnet nur auf Anforderung (state.ts: dirty-Flag). Für
  // gezogene Bewegungen genügt der Rückgabewert von controls.update() in der
  // Schleife unten, weil das Dämpfen über mehrere Frames ausklingt.
  //
  // Das Mausrad ist der Sonderfall: OrbitControls verrechnet den Zoom im
  // wheel-Handler sofort und ruft dabei selbst update() auf. Im nächsten
  // Frame meldet update() deshalb "keine Änderung", das dirty-Flag bleibt
  // aus — die Kamera steht neu, das Bild aber noch alt. Sichtbar wurde der
  // Zoom erst beim nächsten beliebigen Ereignis, etwa einem Klick
  // (Nutzerbefund 08.08.2026, Chrome/macOS; Touch-Pinch war nie betroffen).
  // Das change-Ereignis deckt jeden Eingabeweg ab, egal wann intern
  // aktualisiert wird.
  controls.addEventListener('change', () => ctx.requestRender());

  // --- Größe & Schleife ---
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(viewportEl);
  window.addEventListener('resize', resize);

  buildPresetButtons();
  updateHud();

  renderer.setAnimationLoop(() => {
    if (controls.update()) ctx.requestRender();
    if (!isDirty()) return;
    clearDirty();
    renderer.render(scene, camera);
  });

  ctx.requestRender();
}

/**
 * Passt die Kamera an die aktuelle Ausdehnung aller Modelldaten an.
 * Nach dem Laden bzw. nach größeren Änderungen aufrufen.
 */
export function frameAll(view: ViewName | null = activeView): void {
  computeModelBox();
  if (modelBox.isEmpty()) return;

  const center = modelBox.getCenter(new THREE.Vector3());
  ctx.controls.target.copy(center);

  if (view) setView(view, false);
  else placeCamera(ctx.camera.position.clone().sub(center).normalize(), center);

  ctx.controls.update();
  updateHud();
  ctx.requestRender();
}

/** Setzt eine der Preset-Ansichten. */
export function setView(view: ViewName, recompute = true): void {
  if (recompute) computeModelBox();
  const center = modelBox.isEmpty()
    ? ctx.controls.target.clone()
    : modelBox.getCenter(new THREE.Vector3());

  ctx.camera.up.set(0, 0, 1);
  if (view === 'oben') ctx.camera.up.set(0, 1, 0); // Norden oben

  ctx.controls.target.copy(center);
  placeCamera(VIEW_DIRS[view].clone().normalize(), center);
  ctx.controls.update();

  activeView = view;
  markActivePreset();
  ctx.requestRender();
}

/** Setzt die Kamera so, dass die Modellhülle vollständig im Bild liegt. */
function placeCamera(dir: THREE.Vector3, center: THREE.Vector3): void {
  const size = modelBox.isEmpty()
    ? new THREE.Vector3(11, 10, 10)
    : modelBox.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 1);

  const camera = ctx.camera;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  // Faktor > 1 = kleiner Rand. Bei 0,92 stand das Gebäude bis an den unteren
  // Bildrand und wurde angeschnitten.
  const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.04;

  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(dist / 400, 0.05);
  camera.far = dist * 12;
  camera.updateProjectionMatrix();
}

/** Weltraum-Hüllbox aller Modelldaten (in Metern). */
function computeModelBox(): void {
  modelBox.makeEmpty();
  if (!ctx.root) return;
  ctx.root.updateMatrixWorld(true);
  for (const level of ctx.levels.values()) {
    if (!level.group.visible) continue;
    for (const mesh of level.meshes) {
      if (!mesh.visible) continue;
      modelBox.expandByObject(mesh);
    }
  }
  if (modelBox.isEmpty() && ctx.root.children.length) {
    modelBox.setFromObject(ctx.root);
  }
}

/**
 * Hüllbox geladener Meshes in Projekt-Millimetern (ohne Explosionsversatz).
 *
 * Die Vorgabe umfasst den gesamten Datenbestand — so brauchen es die
 * Schnitt-Schieberegler in clipping.ts. Für Anzeigezwecke lassen sich zwei
 * Verzerrungen abwählen:
 *   excludeOpenings — die OPEN_*-Schneidvolumen stehen je Seite 10 mm über
 *                     die Fassadenflucht hinaus und blähen den Grundriss auf.
 *   visibleOnly     — nur, was gerade tatsächlich zu sehen ist.
 */
export function modelBoxMm(
  opts: { visibleOnly?: boolean; excludeOpenings?: boolean } = {},
): THREE.Box3 {
  const { visibleOnly = false, excludeOpenings = false } = opts;
  const box = new THREE.Box3();
  for (const level of ctx.levels.values()) {
    if (visibleOnly && !level.group.visible) continue;
    for (const mesh of level.meshes) {
      if (visibleOnly && !mesh.visible) continue;
      if (excludeOpenings && mesh.userData?.category === 'OPEN') continue;
      const geom = mesh.geometry as THREE.BufferGeometry;
      geom.computeBoundingBox();
      if (!geom.boundingBox) continue;
      box.union(geom.boundingBox.clone());
    }
  }
  return box;
}

function buildGroundGrid(): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'ground-grid';

  const size = 40; // m
  const grid = new THREE.GridHelper(size, size, 0x9aa1aa, 0xc6cad0);
  grid.rotation.x = Math.PI / 2; // XZ -> XY (Z-up)
  grid.position.set(5.24, 4.93, -0.002);
  const gm = grid.material as THREE.Material | THREE.Material[];
  for (const m of Array.isArray(gm) ? gm : [gm]) {
    m.transparent = true;
    m.opacity = 0.42;
    m.depthWrite = false;
  }
  grid.renderOrder = -1;
  group.add(grid);

  return group;
}

function buildPresetButtons(): void {
  const host = document.getElementById('view-presets');
  if (!host) return;
  host.innerHTML = '';
  for (const v of VIEW_LABELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn view-preset';
    btn.dataset.view = v.id;
    btn.textContent = v.label;
    btn.title = v.title;
    btn.addEventListener('click', () => setView(v.id));
    host.appendChild(btn);
  }
  markActivePreset();
}

function markActivePreset(): void {
  const host = document.getElementById('view-presets');
  if (!host) return;
  for (const btn of Array.from(host.querySelectorAll<HTMLElement>('.view-preset'))) {
    btn.classList.toggle('is-active', btn.dataset.view === activeView);
  }
}

/** Kleine Fußzeile im Viewport mit den Bezugsgrößen des Modells. */
export function updateHud(): void {
  if (!hudEl) return;
  const z0 = ctx.manifest?.z0_abs_m ?? 10.67;
  const lines = [`Z = 0 m = EG-FFB = ${fmt(z0, 3)} m ü. NN · Maße in m`];

  // Grundriss: fester Bezugswert des Bauwerks, deshalb ohne die
  // OPEN_*-Schneidvolumen gemessen (die stehen 10 mm je Seite über).
  const grund = modelBoxMm({ excludeOpenings: true });
  if (!grund.isEmpty()) {
    const s = grund.getSize(new THREE.Vector3());
    lines.push(
      `Grundriss ${fmt(s.x / 1000, 2)} × ${fmt(s.y / 1000, 2)} m`,
    );
  }

  // Höhe: was gerade wirklich zu sehen ist — sonst stünde hier dauerhaft
  // der First der Variante 2, auch wenn nur der Bestand eingeblendet ist.
  const sicht = modelBoxMm({ visibleOnly: true, excludeOpenings: true });
  if (!sicht.isEmpty()) {
    lines.push(
      `Sichtbar bis ${fmt(sicht.max.z / 1000, 2)} m über EG-FFB (${fmt(
        z0 + sicht.max.z / 1000,
        2,
      )} m ü. NN)`,
    );
  } else {
    lines.push('Zurzeit ist keine Ebene eingeblendet.');
  }
  hudEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
}

function fmt(v: number, digits: number): string {
  return v.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function resize(): void {
  if (!viewportEl || !ctx.renderer) return;
  const w = Math.max(viewportEl.clientWidth, 1);
  const h = Math.max(viewportEl.clientHeight, 1);
  ctx.renderer.setSize(w, h, false);
  ctx.camera.aspect = w / h;
  ctx.camera.updateProjectionMatrix();
  ctx.requestRender();
}

function requireEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[viewer] Element #${id} fehlt im DOM.`);
  return el;
}
