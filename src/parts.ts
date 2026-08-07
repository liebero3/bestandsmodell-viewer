/**
 * AP9 — Einzelne Bauteile ausblenden.
 *
 * Zwei Anwendungsfälle, die die Ebenen-Checkboxen nicht abdecken:
 *   1. Böden und Decken abschalten, um in ein Geschoss hineinzusehen, ohne
 *      die ganze Ebene wegzunehmen.
 *   2. Die Wandstücke abschalten, die in Umbauvariante 2 entfallen würden.
 *      Sie bleiben Bestandsbauteile — der Variantenzustand wird gezeigt,
 *      indem man sie ausblendet, nicht indem der Bestand verfälscht wird.
 *
 * Materialhoheit dieses Moduls (siehe state.ts):
 *   mesh.visible der unten aufgeführten Bauteile in den Bestandsebenen.
 * Diese Zuständigkeit ist überschneidungsfrei zu den anderen Modulen:
 *   - layers.ts   fasst nur `group.visible` an,
 *   - variant.ts  nur `mesh.visible` der Ebenen dach_bestand/variante2
 *                 (dort steht keines dieser Bauteile),
 *   - evidence.ts nur `mesh.visible` der Kategorien SPACE und OPEN
 *                 (diese Bauteile sind STR bzw. ARC).
 * Wer die Listen erweitert, muss diese drei Punkte erneut prüfen.
 */

import * as THREE from 'three';
import type { MeshUserData, ViewerContext } from './state.ts';

/** Ein schaltbares Bauteil. */
interface PartSpec {
  /** Objektname aus dem Export. */
  name: string;
  /** Beschriftung in der Seitenleiste. */
  label: string;
  /** Kurzerklärung im Tooltip. */
  title: string;
}

interface PartGroup {
  key: string;
  title: string;
  hint: string;
  parts: PartSpec[];
}

/**
 * Die Namen stammen aus den Generatoren (`scripts/build_eg_plan_model.py`,
 * `scripts/build_og_plan_model.py`); fehlt einer, wird die Zeile ausgelassen
 * und einmal auf der Konsole gewarnt.
 */
const GROUPS: PartGroup[] = [
  {
    key: 'boeden',
    title: 'Böden und Decken',
    hint:
      'Waagerechte Bauteile einzeln abschalten, um von oben in ein Geschoss ' +
      'zu sehen. Die Ebenen-Checkboxen oben nehmen dagegen das ganze ' +
      'Geschoss weg.',
    parts: [
      {
        name: 'STR_EG_SLAB_180',
        label: 'Decke über EG (18 cm)',
        title:
          'Tragende Stahlbetonplatte, Z 2,65–2,83 m. Sie ist zugleich der ' +
          'Boden des Dachgeschosses und enthält den Loggia-Kragarm über der ' +
          'Terrasse. Ausblenden gibt den Blick von oben ins Erdgeschoss frei.',
      },
      {
        name: 'ARC_DG_FLOOR_BUILDUP_100',
        label: 'Fußbodenaufbau DG (10 cm)',
        title:
          'Aufbau über der Rohdecke bis DG-FFB, Z 2,83–2,93 m. Liegt nur ' +
          'unter der beheizten Fläche, nicht unter der Loggia.',
      },
      {
        name: 'ARC_DB_NONHABITABLE_PLAN',
        label: 'Dachbodenfläche',
        title:
          'Dokumentierte Boden-/Planfläche des nicht bewohnten Dachbodens ' +
          'auf Kehlbalkenniveau, Z 5,42 m. Kein modellierter Fußbodenaufbau.',
      },
    ],
  },
  {
    key: 'variante2',
    title: 'Rückbau in Variante 2',
    hint:
      'In Variante 2 wird die Loggia geschlossen und dem Elternzimmer ' +
      'zugeschlagen. Diese beiden Wandstücke würden dabei entfallen. Sie ' +
      'bleiben Bestandsbauteile — Ausblenden zeigt den Variantenzustand.',
    parts: [
      {
        name: 'ARC_OG_LOGGIA_EAST_WALL',
        label: 'Loggia-Ostwand (DG)',
        title:
          '300-mm-Wand zwischen Elternzimmer und Loggia, X 1,50–1,80 m, mit ' +
          'der Fenstertür. Entfällt, wenn die Loggia dem Elternzimmer ' +
          'zugeschlagen wird.',
      },
      {
        name: 'ARC_DB_LOGGIA_SOUTH_WALL',
        label: 'Loggia-Südwand über DG',
        title:
          'Wandstück im Dachboden/Atelier, X 0–1,80 m auf Y 4,43–4,73 m. ' +
          'Trägt nach Statik Pos. 1 kein Dachtragwerk: Die Sparren sind am ' +
          'First verlascht (keine Firstpfette), die Mittelpfetten Pos. 4/5 ' +
          'liegen auf Y 2,67 und 6,11 m. Aussteifende Wirkung als Wandscheibe ' +
          'ist damit NICHT beurteilt — das bleibt der Tragwerksplanung.',
      },
    ],
  },
];

export function initParts(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  const boxes = new Map<string, HTMLInputElement>();
  const meshesByName = new Map<string, THREE.Mesh[]>();
  const missing: string[] = [];
  let rendered = 0;

  for (const group of GROUPS) {
    const found = group.parts
      .map((spec) => ({
        spec,
        meshes: ctx
          .allMeshes()
          .filter((m) => (m.userData as MeshUserData).name === spec.name),
      }))
      .filter((entry) => {
        if (entry.meshes.length) return true;
        missing.push(entry.spec.name);
        return false;
      });
    if (!found.length) continue;

    const box = document.createElement('div');
    box.className = 'prt-group';

    const head = document.createElement('p');
    head.className = 'ctl-label prt-head';
    head.textContent = group.title;
    box.appendChild(head);

    const hint = document.createElement('p');
    hint.className = 'ctl-hint';
    hint.textContent = group.hint;
    box.appendChild(hint);

    const bulk = document.createElement('div');
    bulk.className = 'btn-group';
    bulk.appendChild(
      makeButton('Alle an', () => setGroup(group.key, true), `${group.title}: alle einblenden`),
    );
    bulk.appendChild(
      makeButton('Alle aus', () => setGroup(group.key, false), `${group.title}: alle ausblenden`),
    );
    box.appendChild(bulk);

    const list = document.createElement('div');
    list.className = 'lay-list';
    box.appendChild(list);

    for (const { spec, meshes } of found) {
      meshesByName.set(spec.name, meshes);

      const row = document.createElement('label');
      row.className = 'ctl-check';
      row.title = spec.title;
      row.dataset.group = group.key;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = meshes.some((m) => m.visible);
      input.dataset.group = group.key;
      input.addEventListener('change', () => apply(spec.name, input.checked));
      boxes.set(spec.name, input);

      const swatch = document.createElement('span');
      swatch.className = 'ctl-swatch';
      swatch.style.background = swatchOf(meshes[0]);

      const label = document.createElement('span');
      label.className = 'ctl-check-label';
      label.textContent = spec.label;

      row.append(input, swatch, label);
      list.appendChild(row);
      rendered++;
    }

    host.appendChild(box);
  }

  if (missing.length) {
    console.warn(
      `[viewer] Schaltbare Bauteile nicht im Export gefunden: ${missing.join(', ')}`,
    );
  }

  if (!rendered) {
    const p = document.createElement('p');
    p.className = 'ctl-hint';
    p.textContent = 'Keine schaltbaren Bauteile geladen.';
    host.appendChild(p);
    return;
  }

  const status = document.createElement('p');
  status.className = 'ctl-hint';
  host.appendChild(status);
  updateStatus();

  // --- Hilfsfunktionen -----------------------------------------------------

  function apply(name: string, visible: boolean): void {
    for (const mesh of meshesByName.get(name) ?? []) mesh.visible = visible;
    updateStatus();
    ctx.emit('part-visibility', { name, visible });
    ctx.requestRender();
  }

  function setGroup(key: string, visible: boolean): void {
    for (const [name, input] of boxes) {
      if (input.dataset.group !== key) continue;
      input.checked = visible;
      for (const mesh of meshesByName.get(name) ?? []) mesh.visible = visible;
    }
    updateStatus();
    ctx.emit('part-visibility', { name: `${key}:*`, visible });
    ctx.requestRender();
  }

  function updateStatus(): void {
    const off = [...boxes.values()].filter((b) => !b.checked).length;
    status.textContent =
      off === 0
        ? 'Alle Bauteile sichtbar.'
        : `${off} von ${boxes.size} Bauteilen ausgeblendet.`;
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
