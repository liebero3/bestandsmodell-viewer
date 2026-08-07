/**
 * AP9 — Böden und Decken einzeln ausblenden.
 *
 * Zweck: In ein Geschoss hineinsehen, ohne die ganze Ebene abzuschalten. Die
 * Ebenen-Checkboxen in layers.ts nehmen immer das komplette Geschoss weg;
 * hier geht es um die waagerechten Bauteile allein.
 *
 * Materialhoheit dieses Moduls (siehe state.ts):
 *   mesh.visible der unten aufgeführten Bauteile in den Bestandsebenen.
 * Diese Zuständigkeit ist überschneidungsfrei zu den anderen Modulen:
 *   - layers.ts   fasst nur `group.visible` an,
 *   - variant.ts  nur `mesh.visible` der Ebenen dach_bestand/variante2
 *                 (dort steht keines dieser Bauteile),
 *   - evidence.ts nur `mesh.visible` der Kategorien SPACE und OPEN
 *                 (diese Bauteile sind STR bzw. ARC).
 * Wer die Liste erweitert, muss diese drei Punkte erneut prüfen.
 */

import * as THREE from 'three';
import type { MeshUserData, ViewerContext } from './state.ts';

/** Ein schaltbares waagerechtes Bauteil. */
interface PartSpec {
  /** Objektname aus dem Export. */
  name: string;
  /** Beschriftung in der Seitenleiste. */
  label: string;
  /** Kurzerklärung im Tooltip. */
  title: string;
}

/**
 * Reihenfolge von unten nach oben. Die Namen stammen aus den Generatoren
 * (`scripts/build_eg_plan_model.py`, `scripts/build_og_plan_model.py`); fehlt
 * einer, wird die Zeile stillschweigend ausgelassen und einmal gewarnt.
 */
const PARTS: PartSpec[] = [
  {
    name: 'STR_EG_SLAB_180',
    label: 'Decke über EG (18 cm)',
    title:
      'Tragende Stahlbetonplatte, Z 2,65–2,83 m. Sie ist zugleich der Boden ' +
      'des Dachgeschosses und enthält den Loggia-Kragarm über der Terrasse. ' +
      'Ausblenden gibt den Blick von oben ins Erdgeschoss frei.',
  },
  {
    name: 'ARC_DG_FLOOR_BUILDUP_100',
    label: 'Fußbodenaufbau DG (10 cm)',
    title:
      'Aufbau über der Rohdecke bis DG-FFB, Z 2,83–2,93 m. Liegt nur unter ' +
      'der beheizten Fläche, nicht unter der Loggia.',
  },
  {
    name: 'ARC_DB_NONHABITABLE_PLAN',
    label: 'Dachbodenfläche',
    title:
      'Dokumentierte Boden-/Planfläche des nicht bewohnten Dachbodens auf ' +
      'Kehlbalkenniveau, Z 5,42 m. Kein modellierter Fußbodenaufbau.',
  },
];

export function initParts(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  const lead = document.createElement('p');
  lead.className = 'ctl-hint';
  lead.textContent =
    'Waagerechte Bauteile einzeln abschalten, um von oben in ein Geschoss ' +
    'zu sehen. Die Ebenen-Checkboxen oben nehmen dagegen das ganze ' +
    'Geschoss weg.';
  host.appendChild(lead);

  /** Gefundene Bauteile mit ihren Meshes — leere Einträge fallen raus. */
  const found: Array<{ spec: PartSpec; meshes: THREE.Mesh[] }> = [];
  const missing: string[] = [];
  for (const spec of PARTS) {
    const meshes = ctx
      .allMeshes()
      .filter((m) => (m.userData as MeshUserData).name === spec.name);
    if (meshes.length) found.push({ spec, meshes });
    else missing.push(spec.name);
  }
  if (missing.length) {
    console.warn(
      `[viewer] Böden/Decken nicht im Export gefunden: ${missing.join(', ')}`,
    );
  }

  if (!found.length) {
    const p = document.createElement('p');
    p.className = 'ctl-hint';
    p.textContent = 'Keine Boden- oder Deckenbauteile geladen.';
    host.appendChild(p);
    return;
  }

  const boxes = new Map<string, HTMLInputElement>();

  const bulk = document.createElement('div');
  bulk.className = 'btn-group';
  bulk.appendChild(
    makeButton('Alle an', () => setAll(true), 'Alle Böden und Decken einblenden'),
  );
  bulk.appendChild(
    makeButton('Alle aus', () => setAll(false), 'Alle Böden und Decken ausblenden'),
  );
  host.appendChild(bulk);

  const list = document.createElement('div');
  list.className = 'lay-list';
  host.appendChild(list);

  for (const { spec, meshes } of found) {
    const row = document.createElement('label');
    row.className = 'ctl-check';
    row.title = spec.title;

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = meshes.some((m) => m.visible);
    box.addEventListener('change', () => {
      apply(spec.name, box.checked);
    });
    boxes.set(spec.name, box);

    const swatch = document.createElement('span');
    swatch.className = 'ctl-swatch';
    swatch.style.background = swatchOf(meshes[0]);

    const label = document.createElement('span');
    label.className = 'ctl-check-label';
    label.textContent = spec.label;

    row.append(box, swatch, label);
    list.appendChild(row);
  }

  const status = document.createElement('p');
  status.className = 'ctl-hint';
  host.appendChild(status);
  updateStatus();

  // --- Hilfsfunktionen -----------------------------------------------------

  function meshesOf(name: string): THREE.Mesh[] {
    return found.find((f) => f.spec.name === name)?.meshes ?? [];
  }

  function apply(name: string, visible: boolean): void {
    for (const mesh of meshesOf(name)) mesh.visible = visible;
    updateStatus();
    ctx.emit('part-visibility', { name, visible });
    ctx.requestRender();
  }

  function setAll(visible: boolean): void {
    for (const [name, box] of boxes) {
      box.checked = visible;
      for (const mesh of meshesOf(name)) mesh.visible = visible;
    }
    updateStatus();
    ctx.emit('part-visibility', { name: '*', visible });
    ctx.requestRender();
  }

  function updateStatus(): void {
    const off = [...boxes.values()].filter((b) => !b.checked).length;
    status.textContent =
      off === 0
        ? 'Alle Böden und Decken sichtbar.'
        : `${off} von ${boxes.size} ausgeblendet — die Geschosse sind von oben einsehbar.`;
  }
}

/** Farbfeld aus der unveränderten Exportfarbe des Bauteils. */
function swatchOf(mesh: THREE.Mesh): string {
  const color = (mesh.userData as MeshUserData).baseColor;
  return color ? `#${color.getHexString()}` : '#5a6068';
}

function makeButton(
  text: string,
  onClick: () => void,
  title: string,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
