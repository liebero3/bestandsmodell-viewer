/**
 * AP5 — Umbauvariante 2: Bestand / Überlagert / Variante 2.
 *
 * Materialhoheit dieses Moduls (siehe state.ts):
 *   material.opacity · material.transparent · material.depthWrite
 *   mesh.renderOrder · mesh.visible der Ebenen "dach_bestand"/"variante2"
 * Die Gruppensichtbarkeit (`LevelGroup.group.visible`) gehört layers.ts,
 * `mesh.visible` der Kategorien SPACE/OPEN gehört evidence.ts,
 * die Farbe evidence.ts, die Schnittebenen clipping.ts.
 * Jeder Moduswechsel meldet 'variant-mode'; picking.ts hebt daraufhin eine
 * Auswahl auf, die gerade unsichtbar geworden ist.
 *
 * Fachliche Grundlage aller Zahlen: Variante_2/VARIANTE_2.md.
 * Höhenbezug: Z = 0 = EG-FFB = 10,670 m ü. NN.
 */

import * as THREE from 'three';
import { frameAll } from './scene.ts';
import type { ViewerContext } from './state.ts';

/** Ebenen-Ids aus public/models/index.json. */
const LEVEL_BESTAND = 'dach_bestand';
const LEVEL_VARIANTE = 'variante2';

export type VariantMode = 'bestand' | 'ueberlagert' | 'variante2';

/**
 * Einzeln schaltbare Körper der Variante 2, von unten nach oben. Jeder ist
 * ein eigenes Bauteil und unabhängig ausblendbar — sonst lässt sich weder
 * beurteilen, wie viel Höhe allein der Kniestock bringt, noch wie der
 * geschlossene Balkon ohne die neue Wand aussähe.
 * Ihre Sichtbarkeit bleibt in diesem Modul, weil `mesh.visible` der Ebene
 * "variante2" hier verwaltet wird (siehe state.ts); der Schalter wirkt als
 * zusätzlicher Filter über dem Moduszustand.
 */
const VARIANTE_PARTS: Array<{ name: string; label: string; title: string }> = [
  {
    name: 'GEN_V2_WEST_WALL',
    label: 'Neue Außenwand über dem Balkon',
    title:
      'Schließt den Balkon: 300-mm-Wand als West- und Nordschenkel, von ' +
      'DG-FFB bis unter die neue Dachhülle. Sie stünde auf dem Kragarm der ' +
      'Decke über EG — statisch nicht nachgewiesen (siehe Grenzen des Modells).',
  },
  {
    name: 'GEN_V2_DOOR_WEST',
    label: 'Fenstertür Elternzimmer West',
    title:
      'Die heutige Loggia-Fenstertür (1,51 m breit, bodentief) wandert aus ' +
      'der Loggia-Ostwand in die neue Außenwand. Station und Größe ' +
      'unverändert — Planungsannahme, im Bestand nicht belegt.',
  },
  {
    name: 'GEN_V2_KNIESTOCK',
    label: 'Kniestock-Wandband (+0,79 m)',
    title:
      'Aufgemauertes Wandband zwischen Bestands- und Variantenhülle, auf ' +
      'dem vorhandenen Außenwandring inklusive Erker. Allein ausblenden ' +
      'zeigt, welchen Anteil die Dachneigung beiträgt.',
  },
  {
    name: 'GEN_V2_ATELIER_FLOOR',
    label: 'Atelierboden (Kehlbalkenniveau)',
    title:
      'Boden des vergrößerten Ateliers auf Z 5,42 m. Er reicht so weit, wie ' +
      'unter der 45°-Hülle 2,30 m lichte Höhe stehen (Y 3,01–6,02 m), und ' +
      'läuft anders als im Bestand über dem geschlossenen Balkon durch.',
  },
  {
    name: 'GEN_V2_DOOR_ATELIER',
    label: 'Doppeltür Atelier West',
    title:
      'Bodentiefe Doppeltür im Westgiebel, 1,80 m breit, 2,30 m hoch, mittig ' +
      'auf dem neuen First. Die Westfront des Ateliers besteht damit nur ' +
      'noch aus der Außenwand.',
  },
  {
    name: 'GEN_V2_CHIMNEY',
    label: 'Kaminfortsetzung über Dach',
    title:
      'Der Bestandskamin endet an der 38°-Dachfläche und läge unter der ' +
      'neuen Hülle. Diese Fortsetzung führt ihn durch das 45°-Dach bis ' +
      '0,40 m über den First (FeuVO NRW), OK 9,772 m über EG-FFB.',
  },
  {
    name: 'GEN_V2_ROOF',
    label: 'Dachfläche 45°',
    title:
      'Neue Dachhülle der Variante 2, First 9,372 m über EG-FFB, mit ' +
      'Kaminausschnitt. Allein ausblenden gibt den Blick auf den Kniestock frei.',
  },
];

/** Zielzustand eines Mesh-Satzes. */
interface MeshState {
  visible: boolean;
  opacity: number;
  depthWrite: boolean;
  renderOrder: number;
}

/** Ausgangszustand aus loader.ts — vollständig opak, keine Sonderreihenfolge. */
const NEUTRAL: MeshState = {
  visible: true,
  opacity: 1,
  depthWrite: true,
  renderOrder: 0,
};

const HIDDEN: MeshState = { ...NEUTRAL, visible: false };

/** Überlagerung: Variante klar lesbar vor stark zurückgenommenem Bestand. */
const OVERLAY_VARIANTE: MeshState = {
  visible: true,
  opacity: 0.45,
  depthWrite: false,
  renderOrder: 3,
};
const OVERLAY_BESTAND: MeshState = {
  visible: true,
  // 0,15 war gegen die hellen Wände praktisch unsichtbar — bei 0,32 bleibt
  // die 38°-Kontur des Bestands im Vergleich ablesbar.
  opacity: 0.32,
  depthWrite: false,
  renderOrder: 2,
};

const MODES: Array<{ id: VariantMode; label: string; title: string }> = [
  {
    id: 'bestand',
    label: 'Bestand',
    title: 'Nur das Bestandsdach (38°). Variante 2 ausgeblendet.',
  },
  {
    id: 'ueberlagert',
    label: 'Überlagert',
    title:
      'Variante 2 halbtransparent über dem stark zurückgenommenen Bestandsdach.',
  },
  {
    id: 'variante2',
    label: 'Variante 2',
    title: 'Nur die neue Hülle (45°, Kniestock +0,79 m). Bestandsdach ausgeblendet.',
  },
];

/** Kennwert-Gegenüberstellung. Alle Zahlen aus Variante_2/VARIANTE_2.md. */
interface KeyFigure {
  label: string;
  bestand: string;
  variante: string;
  /** Zweite, kleinere Zeile — absolute Höhe in m ü. NN. */
  bestandAbs?: string;
  varianteAbs?: string;
  /** Fußnote: Stationen mit * sind scan-/modellabgeleitet. */
  note?: boolean;
}

const FIGURES: KeyFigure[] = [
  { label: 'Dachneigung', bestand: '38°', variante: '45°' },
  { label: 'Kniestockerhöhung', bestand: '—', variante: '+0,79 m' },
  {
    label: 'Kniestock Süd (Wandachse ü. DG-FFB)',
    bestand: '1,103 m',
    variante: '1,93 m',
  },
  {
    label: 'OK Traufe Süd (Dachhaut)',
    bestand: '4,05 m',
    bestandAbs: '14,72',
    variante: '4,86 m',
    varianteAbs: '15,526',
  },
  {
    label: 'OK Traufe Nord (Dachhaut)*',
    bestand: '3,22 m',
    bestandAbs: '13,888',
    variante: '4,02 m',
    varianteAbs: '14,694',
    note: true,
  },
  {
    label: 'First außen',
    bestand: '7,488 m',
    bestandAbs: '18,158',
    variante: '9,372 m',
    varianteAbs: '20,042',
  },
  {
    label: 'Innerer First über Atelierboden',
    bestand: '1,93 m',
    variante: '3,80 m',
  },
  {
    label: 'Atelier lichte 3,00 × 2,30 m',
    bestand: 'nein',
    variante: 'ja',
  },
  {
    label: 'Balkon/Loggia West',
    bestand: 'offen, 1,50 m',
    variante: 'geschlossen',
  },
  {
    label: 'Atelierboden (Zone ≥ 2,30 m lichte)*',
    bestand: '3,38 m ohne Loggia',
    variante: '3,00 m durchgehend',
    note: true,
  },
  {
    label: 'OK Kaminkopf',
    bestand: 'tbd',
    variante: '9,772 m',
    varianteAbs: '20,442',
  },
];

export function initVariant(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  let mode: VariantMode = 'bestand';
  let hideBestandInOverlay = false;

  // --- Bedienelemente -------------------------------------------------------

  const radios = new Map<VariantMode, HTMLInputElement>();
  const groupName = `var-mode-${Math.random().toString(36).slice(2, 8)}`;

  const list = document.createElement('div');
  list.className = 'var-modes';
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', 'Darstellung der Umbauvariante');

  for (const m of MODES) {
    const row = document.createElement('label');
    row.className = 'ctl-check';
    row.title = m.title;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = groupName;
    input.value = m.id;
    input.checked = m.id === mode;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      mode = m.id;
      apply();
    });
    radios.set(m.id, input);

    const swatch = document.createElement('span');
    swatch.className = 'ctl-swatch var-swatch';
    swatch.dataset.mode = m.id;

    const label = document.createElement('span');
    label.className = 'ctl-check-label';
    label.textContent = m.label;

    row.append(input, swatch, label);
    list.appendChild(row);
  }
  host.appendChild(list);

  // Zusatzoption, nur im Überlagerungsmodus sinnvoll.
  const hideRow = document.createElement('label');
  hideRow.className = 'ctl-check var-suboption';
  hideRow.title =
    'Blendet im Überlagerungsmodus das Bestandsdach vollständig aus, ' +
    'ohne den Modus zu verlassen.';

  const hideBox = document.createElement('input');
  hideBox.type = 'checkbox';
  hideBox.checked = hideBestandInOverlay;
  hideBox.addEventListener('change', () => {
    hideBestandInOverlay = hideBox.checked;
    apply();
  });

  const hideLabel = document.createElement('span');
  hideLabel.className = 'ctl-check-label';
  hideLabel.textContent = 'Bestandsdach ganz ausblenden';

  hideRow.append(hideBox, hideLabel);
  host.appendChild(hideRow);

  // Einzelschaltung der beiden Variantenkörper.
  const partBoxes = new Map<string, HTMLInputElement>();
  const partsBox = document.createElement('div');
  partsBox.className = 'var-parts';

  const partsHead = document.createElement('p');
  partsHead.className = 'ctl-label var-parts-head';
  partsHead.textContent = 'Bauteile der Variante 2';
  partsBox.appendChild(partsHead);

  for (const part of VARIANTE_PARTS) {
    const row = document.createElement('label');
    row.className = 'ctl-check var-suboption';
    row.title = part.title;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.addEventListener('change', () => apply());
    partBoxes.set(part.name, input);

    const label = document.createElement('span');
    label.className = 'ctl-check-label';
    label.textContent = part.label;

    row.append(input, label);
    partsBox.appendChild(row);
  }
  host.appendChild(partsBox);

  const sep = document.createElement('hr');
  sep.className = 'ctl-sep';
  host.appendChild(sep);

  // --- Kennwerte ------------------------------------------------------------

  // Die Gegenüberstellung ist der längste Block der Sidebar und deshalb
  // einklappbar — Vorgabe bleibt aufgeklappt, es wird nichts versteckt.
  const figBox = document.createElement('details');
  figBox.className = 'side-sub var-figbox';
  figBox.open = true;
  const figSum = document.createElement('summary');
  figSum.textContent = `Kennwerte Bestand gegen Variante 2 (${FIGURES.length})`;
  figBox.appendChild(figSum);
  figBox.appendChild(buildFigureTable());

  const hint = document.createElement('p');
  hint.className = 'ctl-hint var-hint';
  hint.textContent =
    'Höhen relativ zu Z = 0 = EG-FFB, klein darunter absolut in m ü. NN ' +
    '(EG-FFB = 10,670 m ü. NN). * = modellabgeleitet, aufmaßpflichtig. ' +
    'Quelle: Variante_2/VARIANTE_2.md — kein Aufmaß, kein ' +
    'Standsicherheitsnachweis.';
  figBox.appendChild(hint);
  host.appendChild(figBox);

  const status = document.createElement('p');
  status.className = 'ctl-hint var-status';
  host.appendChild(status);

  // --- Anwenden -------------------------------------------------------------

  /** Meshes einer Ebene; leeres Array, solange nichts geladen ist. */
  function meshesOf(levelId: string): THREE.Mesh[] {
    return ctx.levels.get(levelId)?.meshes ?? [];
  }

  /** true, wenn die Ebene selbst eingeblendet ist (Checkbox in layers.ts). */
  function groupVisible(levelId: string): boolean {
    return ctx.levels.get(levelId)?.group.visible ?? false;
  }

  /**
   * Meldezeile: beschreibt, was TATSÄCHLICH zu sehen ist. Sie muss auch die
   * Ebenen-Checkboxen berücksichtigen, sonst behauptet sie "sichtbar" für ein
   * Dach, dessen Ebene der Nutzer gerade ausgeblendet hat.
   */
  function statusText(): string {
    const bestand = meshesOf(LEVEL_BESTAND);
    const variante = meshesOf(LEVEL_VARIANTE);
    if (!bestand.length && !variante.length) return 'Keine Dachebenen geladen.';

    const bOn = groupVisible(LEVEL_BESTAND) && bestand.some((m) => m.visible);
    const vOn = groupVisible(LEVEL_VARIANTE) && variante.some((m) => m.visible);

    const parts: string[] = [];
    if (bOn) parts.push('Bestandsdach 38°, First 7,49 m über EG-FFB');
    if (vOn) parts.push('Variante 2, First 9,37 m über EG-FFB (+1,88 m)');
    if (!parts.length) return 'Zurzeit ist keine der beiden Dachebenen sichtbar.';

    let text = `Sichtbar: ${parts.join(' · ')}.`;
    const aus = VARIANTE_PARTS.filter(
      (p) => partBoxes.get(p.name)?.checked === false,
    );
    if (vOn && aus.length) {
      // Bei sieben Körpern würde die vollständige Liste den Absatz sprengen.
      text +=
        aus.length <= 2
          ? ` Ausgeblendet: ${aus.map((p) => p.label).join(', ')}.`
          : ` ${aus.length} von ${VARIANTE_PARTS.length} Variantenkörpern ausgeblendet.`;
    }
    if (mode === 'ueberlagert' && bOn && vOn) {
      // Prozente aus den Konstanten ableiten, damit Text und Darstellung
      // nicht auseinanderlaufen können.
      text +=
        ` Deckkraft: Variante ${pct(OVERLAY_VARIANTE.opacity)},` +
        ` Bestand ${pct(OVERLAY_BESTAND.opacity)}.`;
    }
    return text;
  }

  /**
   * true, wenn dieser Körper laut Einzelschalter gezeigt werden darf.
   * Körper ohne eigenen Schalter (Bestandsdach) sind immer freigegeben.
   */
  function partAllowed(mesh: THREE.Mesh): boolean {
    const name = String((mesh.userData as { name?: string }).name ?? '');
    const box = partBoxes.get(name);
    return box ? box.checked : true;
  }

  function setState(meshes: THREE.Mesh[], state: MeshState): void {
    for (const mesh of meshes) {
      mesh.visible = state.visible && partAllowed(mesh);
      mesh.renderOrder = state.renderOrder;
      for (const mat of materialsOf(mesh)) {
        // transparent strikt aus der Deckkraft ableiten — so bleibt beim
        // Zurückschalten garantiert keine Resttransparenz stehen.
        mat.transparent = state.opacity < 1;
        mat.opacity = state.opacity;
        mat.depthWrite = state.depthWrite;
        mat.needsUpdate = true;
      }
    }
  }

  function apply(refit = false): void {
    const bestand = meshesOf(LEVEL_BESTAND);
    const variante = meshesOf(LEVEL_VARIANTE);

    switch (mode) {
      case 'bestand':
        // Auch hier abschaltbar: die Ebenenliste sperrt die Dachebenen,
        // also ist dies der einzige Weg, den Blick ins Dachgeschoss
        // freizuräumen.
        setState(bestand, hideBestandInOverlay ? HIDDEN : NEUTRAL);
        setState(variante, HIDDEN);
        break;
      case 'ueberlagert':
        setState(
          bestand,
          hideBestandInOverlay ? HIDDEN : OVERLAY_BESTAND,
        );
        setState(variante, OVERLAY_VARIANTE);
        break;
      case 'variante2':
        // Im Variantenmodus ist das Bestandsdach ohnehin aus; der Schalter
        // hat hier nichts zu bestimmen.
        setState(bestand, HIDDEN);
        setState(variante, NEUTRAL);
        break;
    }

    hideRow.classList.toggle('is-disabled', mode === 'variante2');
    hideBox.disabled = mode === 'variante2';

    for (const [id, input] of radios) input.checked = id === mode;

    status.textContent = statusText();

    ctx.emit('variant-mode', { mode, hideBestandInOverlay });
    if (refit) frameAll();
    ctx.requestRender();
  }

  // Vorgabezustand herstellen — auch dann, wenn die Ebenen zum Zeitpunkt
  // dieses Aufrufs bereits geladen sind (das ist der Normalfall, main.ts
  // wartet auf loadModel). Der Listener deckt den umgekehrten Fall ab.
  const alreadyLoaded = meshesOf(LEVEL_VARIANTE).length > 0;
  apply(alreadyLoaded); // Neu einpassen: die Variante fiel gerade aus der Hülle
  ctx.on('levels-loaded', () => apply(true));

  // Wird eine Ebene per Checkbox wieder eingeblendet, muss der Modus
  // weiterhin gelten (layers.ts schaltet nur group.visible).
  ctx.on('level-visibility', (payload?: { levelId?: string }) => {
    if (payload?.levelId === LEVEL_BESTAND || payload?.levelId === LEVEL_VARIANTE) {
      apply();
    }
  });
}

// --- Hilfsfunktionen --------------------------------------------------------

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  const m = mesh.material;
  return Array.isArray(m) ? m : [m];
}

function pct(opacity: number): string {
  return `${Math.round(opacity * 100)} %`;
}

function buildFigureTable(): HTMLElement {
  const table = document.createElement('div');
  table.className = 'var-figs';

  const head = document.createElement('div');
  head.className = 'var-fig-row var-fig-head';
  head.append(
    cell('Kennwert', 'var-fig-key'),
    cell('Bestand', 'var-fig-val'),
    cell('Variante 2', 'var-fig-val'),
  );
  table.appendChild(head);

  for (const f of FIGURES) {
    const row = document.createElement('div');
    row.className = 'var-fig-row';
    row.append(
      cell(f.label, 'var-fig-key'),
      valueCell(f.bestand, f.bestandAbs),
      valueCell(f.variante, f.varianteAbs, true),
    );
    if (f.note) row.classList.add('var-fig-note');
    table.appendChild(row);
  }

  return table;
}

function cell(text: string, cls: string): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

function valueCell(main: string, abs?: string, accent = false): HTMLElement {
  const el = document.createElement('span');
  el.className = accent ? 'var-fig-val is-variant' : 'var-fig-val';
  const strong = document.createElement('span');
  strong.className = 'var-fig-main';
  strong.textContent = main;
  el.appendChild(strong);
  if (abs) {
    // Nur die Zahl — die Einheit "m ü. NN" steht einmal in der Fußnote
    // darunter. Zwei Wörter je Zelle würden die schmale Spalte umbrechen.
    const sub = document.createElement('span');
    sub.className = 'var-fig-abs';
    sub.textContent = abs;
    sub.title = `${abs} m ü. NN`;
    el.appendChild(sub);
  }
  return el;
}
