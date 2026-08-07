/**
 * Gemeinsamer Laufzeitzustand des Viewers.
 *
 * `ctx` ist das einzige Objekt, das alle Feature-Module kennen. Die
 * Three.js-Felder werden von scene.ts, die Ebenen von loader.ts gefüllt.
 *
 * Materialhoheit (damit sich Module zur Laufzeit nicht in die Quere kommen):
 *   evidence.ts -> material.color
 *   variant.ts  -> material.opacity / transparent / depthWrite / mesh.renderOrder
 *   clipping.ts -> material.clippingPlanes
 *   picking.ts  -> material.emissive / material.emissiveIntensity
 *
 * `visible` ist auf drei Ebenen aufgeteilt und überschneidungsfrei:
 *   layers.ts   -> LevelGroup.group.visible (ganze Ebene)
 *   variant.ts  -> mesh.visible der Ebenen "dach_bestand" und "variante2"
 *                  (dort ausschließlich GEN_*-Körper)
 *   evidence.ts -> mesh.visible der Kategorien SPACE und OPEN
 *                  (die es in den beiden Dachebenen nicht gibt)
 *   parts.ts    -> mesh.visible der waagerechten Bauteile STR_EG_SLAB_180,
 *                  ARC_DG_FLOOR_BUILDUP_100 und ARC_DB_NONHABITABLE_PLAN
 *                  (Kategorie STR/ARC, nicht in den Dachebenen)
 * Die Einzelschalter der Variantenkörper GEN_V2_* liegen bewusst IN
 * variant.ts und nicht in parts.ts, damit `mesh.visible` der Ebene
 * "variante2" weiterhin genau ein Modul besitzt.
 * Wer eine Ebene oder Kategorie hinzufügt, muss diese Aufteilung prüfen.
 */

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Evidence, LevelInfo, Manifest, MeshCategory } from './types.ts';

/** Nutzdaten, die jedes geladene Mesh in `mesh.userData` trägt. */
export interface MeshUserData {
  name: string;
  label: string;
  category: MeshCategory | string;
  levelId: string;
  evidence: Evidence;
  /** Unveränderte Exportfarbe — Referenz für Farbwechsel und Reset. */
  baseColor: THREE.Color;
}

/** Eine Ebene (Geschoss bzw. Dachvariante) samt ihrer Meshes. */
export interface LevelGroup {
  info: LevelInfo;
  group: THREE.Group;
  meshes: THREE.Mesh[];
}

export type ViewerEventHandler = (payload?: any) => void;

/**
 * Bekannte Ereignisse (Module dürfen weitere eigene ergänzen):
 *   'levels-loaded'       — alle Ebenen sind in der Szene    (payload: LevelGroup[])
 *   'level-visibility'    — Ebene ein-/ausgeblendet          (payload: {levelId, visible})
 *   'explode'             — Explosionsfaktor geändert        (payload: {factor})
 *   'variant-mode'        — Variantenmodus gewechselt        (payload: {mode, hideBestandInOverlay})
 *   'category-visibility' — SPACE-/OPEN-Filter geändert      (payload: {SPACE, OPEN})
 *   'part-visibility'     — Boden/Decke ein-/ausgeblendet      (payload: {name, visible})
 *   'clipping'            — Schnittebenen geändert           (payload: {horizontal, vertical})
 *   'selection'           — Bauteilauswahl geändert          (payload: THREE.Mesh | null)
 */
export interface ViewerContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Wurzelgruppe aller Modelldaten, skaliert mm -> m (0.001). */
  root: THREE.Group;

  levels: Map<string, LevelGroup>;
  manifest: Manifest;

  /** Alle geladenen Meshes über alle Ebenen hinweg. */
  allMeshes(): THREE.Mesh[];
  /** Markiert die Szene als "neu zu zeichnen" (Render-on-demand). */
  requestRender(): void;

  on(event: string, cb: ViewerEventHandler): void;
  off(event: string, cb: ViewerEventHandler): void;
  emit(event: string, payload?: any): void;
}

// --- Render-on-demand -------------------------------------------------------

let dirty = true;

/** true, wenn seit dem letzten Frame ein Neuzeichnen angefordert wurde. */
export function isDirty(): boolean {
  return dirty;
}

/** Wird von der Renderschleife in scene.ts nach dem Zeichnen aufgerufen. */
export function clearDirty(): void {
  dirty = false;
}

// --- Ereignisbus ------------------------------------------------------------

const listeners = new Map<string, Set<ViewerEventHandler>>();

// --- Kontext ----------------------------------------------------------------

/**
 * Die Three.js-Felder sind bis zum Aufruf von `initScene()` nicht belegt;
 * `null!` hält den Typ sauber, ohne jedem Modul Optional-Checks aufzuzwingen.
 */
export const ctx: ViewerContext = {
  scene: null!,
  camera: null!,
  renderer: null!,
  controls: null!,
  root: null!,

  levels: new Map<string, LevelGroup>(),
  manifest: null!,

  allMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const level of ctx.levels.values()) out.push(...level.meshes);
    return out;
  },

  requestRender(): void {
    dirty = true;
  },

  on(event: string, cb: ViewerEventHandler): void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set<ViewerEventHandler>();
      listeners.set(event, set);
    }
    set.add(cb);
  },

  off(event: string, cb: ViewerEventHandler): void {
    listeners.get(event)?.delete(cb);
  },

  emit(event: string, payload?: any): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[viewer] Fehler im Listener für "${event}":`, err);
      }
    }
  },
};

/** Nutzdaten eines Meshes typsicher lesen. */
export function meshData(mesh: THREE.Object3D): MeshUserData {
  return mesh.userData as MeshUserData;
}
