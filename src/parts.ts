/**
 * AP9 — Einzelne Bauteile ausblenden.
 *
 * Zwei Anwendungsfälle, die die Ebenen-Checkboxen nicht abdecken:
 *   1. Böden und Decken abschalten, um in ein Geschoss hineinzusehen, ohne
 *      die ganze Ebene wegzunehmen.
 *   2. Die Bauteile abschalten, die in Umbauvariante 2 entfallen oder durch
 *      einen Variantenkörper ersetzt werden. Sie bleiben Bestandsbauteile —
 *      der Variantenzustand wird gezeigt, indem man sie ausblendet, nicht
 *      indem der Bestand verfälscht wird.
 *
 * Bauteile mit `variant`-Angabe blendet der Variantenmodus zusätzlich selbst
 * aus: sonst stünde in Variante 2 die Loggia-Brüstung in der neuen Außenwand
 * und der Bestands-Dachboden koplanar im neuen Atelierboden. Der Wunsch des
 * Nutzers bleibt dabei getrennt gespeichert (`wanted`), damit ein Rückwechsel
 * auf „Bestand“ exakt den vorherigen Zustand herstellt.
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
  /**
   * Gesetzt, wenn Variante 2 dieses Bauteil selbst ausblenden muss.
   * `entfaellt` = wird zurückgebaut, `ersetzt` = ein Variantenkörper tritt
   * an seine Stelle. Der Text erscheint als Marke neben der Checkbox.
   */
  variant?: 'entfällt' | 'ersetzt';
  /** Varianten, in denen der automatische Rueckbau gilt; ohne Angabe 2–4. */
  variants?: string[];
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
          'auf Kehlbalkenniveau, Z 5,42 m. Kein modellierter Fußbodenaufbau. ' +
          'In Variante 2 tritt der größere Atelierboden an ihre Stelle — sie ' +
          'liegt sonst deckungsgleich darin.',
        variant: 'ersetzt',
      },
    ],
  },
  {
    key: 'variante2',
    title: 'Entfällt in Varianten 2–4',
    hint:
      'In den Varianten 2–4 wird der Balkon geschlossen und dem Elternzimmer ' +
      'zugeschlagen. Diese Bestandsbauteile entfallen dabei. Sie bleiben ' +
      'Bestand — Ausblenden zeigt den Variantenzustand. Im Modus ' +
      '„Variante“ geschieht das automatisch.',
    parts: [
      {
        name: 'ARC_OG_LOGGIA_EAST_WALL',
        label: 'Loggia-Ostwand (DG)',
        title:
          '300-mm-Wand zwischen Elternzimmer und Loggia, X 1,50–1,80 m, mit ' +
          'der Fenstertür. Entfällt, wenn die Loggia dem Elternzimmer ' +
          'zugeschlagen wird. Achtung: Sie trägt heute Auflager A der ' +
          'Nordpfette Pos. 4 (23,84 kN) — dafür braucht es Ersatz.',
        variant: 'entfällt',
      },
      {
        name: 'ARC_DB_LOGGIA_EAST_WALL',
        label: 'Loggia-Ostwand über DG',
        title:
          'Fortsetzung derselben Wand im Dachboden, X 1,50–1,80 m auf ' +
          'Y 4,73–7,11 m, oben am 38°-Dach gekappt. Sie trägt dort das ' +
          'westliche Auflager der Nordpfette Pos. 4 (23,84 kN) und entfällt ' +
          'mit der Wand darunter.',
        variant: 'entfällt',
      },
      {
        name: 'ARC_DG_LOGGIA_PARAPET',
        label: 'Loggia-Brüstung',
        title:
          'Absturzsicherung des offenen Balkons nach Westen und Norden, ' +
          '1,00 m hoch. In Variante 2 steht an dieser Stelle die neue ' +
          'Außenwand, die Brüstung entfällt vollständig.',
        variant: 'entfällt',
      },
      {
        name: 'ARC_DB_LOGGIA_SOUTH_WALL',
        label: 'Loggia-Südwand über DG',
        title:
          'Wandstück im Dachboden/Atelier, X 0,30–1,80 m auf Y 4,43–4,73 m. ' +
          'Trägt nach Statik Pos. 1 kein Dachtragwerk: Die Sparren sind am ' +
          'First verlascht (keine Firstpfette), die Mittelpfetten Pos. 4/5 ' +
          'liegen auf Y 2,67 und 6,11 m. Aussteifende Wirkung als Wandscheibe ' +
          'ist damit NICHT beurteilt — das bleibt der Tragwerksplanung.',
        variant: 'entfällt',
      },
      {
        name: 'ARC_DB_WEST_GABLE_DOOR_PANEL',
        label: 'Westgiebel-Ausfachung (Atelier)',
        title:
          'Das Stück Westgiebelwand, das in Variante 2 der bodentiefen ' +
          'Doppeltür des Ateliers weicht. Sturz und Scheibenwirkung des ' +
        'Giebels sind nicht nachgewiesen.',
        variant: 'entfällt',
        variants: ['2'],
      },
    ],
  },
];

export function initParts(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  const boxes = new Map<string, HTMLInputElement>();
  const specs = new Map<string, PartSpec>();
  const meshesByName = new Map<string, THREE.Mesh[]>();
  /** Nutzerwunsch je Bauteil, unabhängig vom Variantenmodus. */
  const wanted = new Map<string, boolean>();
  const missing: string[] = [];
  let variantHides = false;
  let selectedVariant = '4';
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
      specs.set(spec.name, spec);
      wanted.set(spec.name, meshes.some((m) => m.visible));

      const row = document.createElement('label');
      row.className = 'ctl-check';
      row.title = spec.title;
      row.dataset.group = group.key;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = wanted.get(spec.name) ?? true;
      input.dataset.group = group.key;
      input.addEventListener('change', () => {
        wanted.set(spec.name, input.checked);
        apply(spec.name);
      });
      boxes.set(spec.name, input);

      const swatch = document.createElement('span');
      swatch.className = 'ctl-swatch';
      swatch.style.background = swatchOf(meshes[0]);

      const label = document.createElement('span');
      label.className = 'ctl-check-label';
      label.textContent = spec.label;

      row.append(input, swatch, label);
      if (spec.variant) {
        const tag = document.createElement('span');
        tag.className = 'prt-tag';
        tag.textContent = spec.variants?.length === 1
          ? `nur V${spec.variants[0]} weg`
          : (spec.variant === 'ersetzt' ? 'Var ersetzt' : 'Var weg');
        tag.title =
          spec.variant === 'ersetzt'
            ? 'Im reinen Variantenmodus tritt ein Studienkörper an diese Stelle.'
            : 'Im reinen Variantenmodus wird dieses Bestandsbauteil zurückgebaut.';
        row.appendChild(tag);
      }
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

  // Der Variantenmodus blendet die V2-Bauteile selbst aus. variant.ts meldet
  // jeden Moduswechsel; die Sichtbarkeit bleibt trotzdem hier.
  ctx.on('variant-mode', (payload?: { mode?: string; variantId?: string }) => {
    const hides = payload?.mode === 'variante';
    const nextVariant = payload?.variantId ?? selectedVariant;
    if (hides === variantHides && nextVariant === selectedVariant) return;
    variantHides = hides;
    selectedVariant = nextVariant;
    applyAll();
  });

  applyAll();

  // --- Hilfsfunktionen -----------------------------------------------------

  /** Sichtbar = vom Nutzer gewünscht UND nicht vom Variantenmodus verdeckt. */
  function effective(name: string): boolean {
    const spec = specs.get(name);
    const applies = !spec?.variants || spec.variants.includes(selectedVariant);
    if (variantHides && spec?.variant && applies) return false;
    return wanted.get(name) ?? true;
  }

  function apply(name: string): void {
    const visible = effective(name);
    for (const mesh of meshesByName.get(name) ?? []) mesh.visible = visible;
    boxes.get(name)!.checked = visible;
    updateStatus();
    ctx.emit('part-visibility', { name, visible });
    ctx.requestRender();
  }

  function applyAll(): void {
    for (const name of boxes.keys()) {
      const visible = effective(name);
      for (const mesh of meshesByName.get(name) ?? []) mesh.visible = visible;
      boxes.get(name)!.checked = visible;
    }
    updateStatus();
    ctx.emit('part-visibility', { name: '*', visible: true });
    ctx.requestRender();
  }

  function setGroup(key: string, visible: boolean): void {
    for (const [name, input] of boxes) {
      if (input.dataset.group !== key) continue;
      wanted.set(name, visible);
      const eff = effective(name);
      input.checked = eff;
      for (const mesh of meshesByName.get(name) ?? []) mesh.visible = eff;
    }
    updateStatus();
    ctx.emit('part-visibility', { name: `${key}:*`, visible });
    ctx.requestRender();
  }

  function updateStatus(): void {
    const off = [...boxes.keys()].filter((n) => !effective(n)).length;
    let text =
      off === 0
        ? 'Alle Bauteile sichtbar.'
        : `${off} von ${boxes.size} Bauteilen ausgeblendet.`;
    if (variantHides) {
      text += ' Der reine Variantenmodus blendet die markierten Bestandsbauteile selbst aus.';
    }
    status.textContent = text;
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
