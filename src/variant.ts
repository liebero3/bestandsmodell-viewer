/** Variantensteuerung fuer die Umbauvarianten 2, 3 und 4. */

import * as THREE from 'three';
import { frameAll } from './scene.ts';
import type { ViewerContext } from './state.ts';

const LEVEL_BESTAND = 'dach_bestand';
const PV_PREFIX = 'GEN_V2_PV_';

export type VariantId = '2' | '3' | '4';
export type VariantMode = 'bestand' | 'ueberlagert' | 'variante';

interface Figure {
  label: string;
  bestand: string;
  variante: string;
}

interface VariantConfig {
  id: VariantId;
  levelId: string;
  label: string;
  short: string;
  summary: string;
  figures: Figure[];
}

const VARIANTS: VariantConfig[] = [
  {
    id: '2',
    levelId: 'variante2',
    label: 'Variante 2',
    short: '45° · Kniestock 2,07 m',
    summary: 'Atelier auf Kehlbalkenlage +5,420 m; 3,00 m Breite bei 2,30 m lichter Höhe.',
    figures: [
      { label: 'Dachneigung', bestand: '38°', variante: '45°' },
      { label: 'Kniestock Wandachse', bestand: '1,103 m', variante: '2,070 m' },
      { label: 'OK Traufe Süd', bestand: '14,861 m', variante: '15,670 m' },
      { label: 'First außen', bestand: '18,158 m', variante: '20,040 m' },
      { label: 'Atelierboden', bestand: '16,090 m', variante: '16,090 m' },
      { label: 'Atelier ≥ 2,30 m', bestand: 'nein', variante: '3,00 m · 29,7 m²' },
    ],
  },
  {
    id: '3',
    levelId: 'variante3',
    label: 'Variante 3',
    short: 'DG 2,40 m eben · Dach 45°',
    summary: 'Durchgehende lichte DG-Höhe 2,40 m im Hauptbaukörper, darauf 18 cm Decken-/Atelierbodenzone.',
    figures: [
      { label: 'Dachneigung', bestand: '38°', variante: '45°' },
      { label: 'Kniestock Wandachse', bestand: '1,103 m', variante: '2,430 m' },
      { label: 'DG lichte Höhe', bestand: 'unter Dachschräge', variante: '2,400 m eben' },
      { label: 'OK Traufe Hauptdach', bestand: '14,861 m', variante: '16,030 m' },
      { label: 'First außen', bestand: '18,158 m', variante: '20,400 m' },
      { label: 'OK Atelierboden', bestand: '16,090 m', variante: '16,180 m' },
    ],
  },
  {
    id: '4',
    levelId: 'variante4',
    label: 'Variante 4',
    short: 'Erker bis Atelier · Flachdachgaube',
    summary: 'Variante 3 mit hochgezogenem Erker, offener Verbindung unter der 45°-Dachhaut, 2,30 m Atelierhöhe, 18 cm Flachdach und kleinem Dachboden.',
    figures: [
      { label: 'Dachneigung Hauptdach', bestand: '38°', variante: '45°' },
      { label: 'DG lichte Höhe', bestand: 'unter Dachschräge', variante: '2,400 m eben' },
      { label: 'OK Traufe Hauptdach', bestand: '14,861 m', variante: '16,030 m' },
      { label: 'First außen', bestand: '18,158 m', variante: '20,400 m' },
      { label: 'Flachdach OK', bestand: '—', variante: '18,660 m' },
      { label: 'Kleiner Dachboden', bestand: '—', variante: '1,590 m max. · 3,180 m breit' },
    ],
  },
];

const NEUTRAL = { visible: true, opacity: 1, depthWrite: true, renderOrder: 0 };
const HIDDEN = { ...NEUTRAL, visible: false };
const OVERLAY_VARIANT = { visible: true, opacity: 0.55, depthWrite: false, renderOrder: 3 };
const OVERLAY_BESTAND = { visible: true, opacity: 0.28, depthWrite: false, renderOrder: 2 };
type MeshState = typeof NEUTRAL;

export function initVariant(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';
  let selected: VariantId = '4';
  let mode: VariantMode = 'variante';
  let hideBestandInOverlay = false;
  const wanted = new Map<VariantId, Map<string, boolean>>();
  for (const variant of VARIANTS) wanted.set(variant.id, new Map());

  const variantHead = document.createElement('p');
  variantHead.className = 'ctl-label var-parts-head';
  variantHead.textContent = 'Variante wählen';
  host.appendChild(variantHead);

  const variantButtons = document.createElement('div');
  variantButtons.className = 'var-selector';
  host.appendChild(variantButtons);
  const buttons = new Map<VariantId, HTMLButtonElement>();
  for (const config of VARIANTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'var-select-btn';
    button.dataset.variant = config.id;
    const strong = document.createElement('strong');
    strong.textContent = config.label;
    const small = document.createElement('span');
    small.textContent = config.short;
    button.append(strong, small);
    button.addEventListener('click', () => {
      if (selected === config.id) return;
      selected = config.id;
      renderVariantDetails();
      apply(true);
      ctx.emit('variant-selection', { variantId: selected });
    });
    buttons.set(config.id, button);
    variantButtons.appendChild(button);
  }

  const summary = document.createElement('p');
  summary.className = 'ctl-hint var-summary';
  host.appendChild(summary);
  const sep = document.createElement('hr');
  sep.className = 'ctl-sep';
  host.appendChild(sep);

  const modes = document.createElement('div');
  modes.className = 'var-modes';
  host.appendChild(modes);
  const modeRadios = new Map<VariantMode, HTMLInputElement>();
  const modeName = `var-mode-${Math.random().toString(36).slice(2, 8)}`;
  const modeSpecs: Array<{ id: VariantMode; label: string; title: string }> = [
    { id: 'bestand', label: 'Bestand', title: 'Bestandsdach 38° ohne Studienkörper.' },
    { id: 'ueberlagert', label: 'Überlagert', title: 'Bestandsdach und gewählte Variante transparent vergleichen.' },
    { id: 'variante', label: 'Variante', title: 'Nur die gewählte Umbauvariante zeigen.' },
  ];
  for (const spec of modeSpecs) {
    const row = document.createElement('label');
    row.className = 'ctl-check';
    row.title = spec.title;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = modeName;
    input.checked = spec.id === mode;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      mode = spec.id;
      apply();
    });
    modeRadios.set(spec.id, input);
    const swatch = document.createElement('span');
    swatch.className = 'ctl-swatch var-swatch';
    swatch.dataset.mode = spec.id;
    const label = document.createElement('span');
    label.className = 'ctl-check-label';
    label.textContent = spec.label;
    row.append(input, swatch, label);
    modes.appendChild(row);
  }

  const hideRow = document.createElement('label');
  hideRow.className = 'ctl-check var-suboption';
  const hideBox = document.createElement('input');
  hideBox.type = 'checkbox';
  hideBox.addEventListener('change', () => {
    hideBestandInOverlay = hideBox.checked;
    apply();
  });
  const hideLabel = document.createElement('span');
  hideLabel.className = 'ctl-check-label';
  hideLabel.textContent = 'Bestandsdach im Vergleich ausblenden';
  hideRow.append(hideBox, hideLabel);
  host.appendChild(hideRow);

  const partsBox = document.createElement('div');
  partsBox.className = 'var-parts';
  host.appendChild(partsBox);
  const figuresBox = document.createElement('details');
  figuresBox.className = 'side-sub var-figbox';
  figuresBox.open = true;
  host.appendChild(figuresBox);
  const status = document.createElement('p');
  status.className = 'ctl-hint var-status';
  host.appendChild(status);

  const currentConfig = (): VariantConfig => VARIANTS.find((v) => v.id === selected)!;
  const meshesOf = (levelId: string): THREE.Mesh[] => ctx.levels.get(levelId)?.meshes ?? [];
  const keyOf = (mesh: THREE.Mesh): string => mesh.name.startsWith(PV_PREFIX) ? PV_PREFIX : mesh.name;

  function groupedParts(config: VariantConfig): Map<string, THREE.Mesh[]> {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const mesh of meshesOf(config.levelId)) {
      const key = keyOf(mesh);
      const list = groups.get(key);
      if (list) list.push(mesh);
      else groups.set(key, [mesh]);
    }
    return groups;
  }

  function partAllowed(mesh: THREE.Mesh, variantId: VariantId): boolean {
    const map = wanted.get(variantId)!;
    const key = keyOf(mesh);
    if (!map.has(key)) map.set(key, true);
    return map.get(key) ?? true;
  }

  function renderVariantDetails(): void {
    const config = currentConfig();
    for (const [id, button] of buttons) {
      button.classList.toggle('is-active', id === selected);
      button.setAttribute('aria-pressed', String(id === selected));
    }
    summary.textContent = config.summary;
    document.documentElement.dataset.variant = selected;
    const sectionTitle = document.getElementById('variant-section-title');
    if (sectionTitle) sectionTitle.textContent = config.label;

    partsBox.innerHTML = '';
    const head = document.createElement('p');
    head.className = 'ctl-label var-parts-head';
    head.textContent = `Bauteile ${config.label}`;
    const hint = document.createElement('p');
    hint.className = 'ctl-hint';
    hint.textContent = 'Alle Studienkörper bleiben einzeln ausblendbar; die Explosion wird oben geschossweise geregelt.';
    partsBox.append(head, hint);

    const map = wanted.get(selected)!;
    for (const [key, meshes] of groupedParts(config)) {
      if (!map.has(key)) map.set(key, true);
      const row = document.createElement('label');
      row.className = 'ctl-check var-suboption';
      const data = meshes[0].userData as { label?: string; evidence?: { source?: string } };
      row.title = data.evidence?.source ?? 'Abgeleiteter Studienkörper';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = map.get(key) ?? true;
      input.addEventListener('change', () => {
        map.set(key, input.checked);
        apply();
      });
      const label = document.createElement('span');
      label.className = 'ctl-check-label';
      label.textContent = key === PV_PREFIX ? `PV-Module (${meshes.length})` : (data.label ?? key);
      row.append(input, label);
      partsBox.appendChild(row);
    }

    figuresBox.innerHTML = '';
    const figSummary = document.createElement('summary');
    figSummary.textContent = `Kennwerte Bestand gegen ${config.label}`;
    figuresBox.append(figSummary, buildFigureTable(config));
    const note = document.createElement('p');
    note.className = 'ctl-hint var-hint';
    note.textContent = 'Absolute Höhen in m ü. NN; Z = 0 = EG-FFB 10,670 m. Studienwerte derived/assumed, aufmaß- und prüfpflichtig.';
    figuresBox.appendChild(note);
  }

  function setState(meshes: THREE.Mesh[], state: MeshState, variantId?: VariantId): void {
    for (const mesh of meshes) {
      mesh.visible = state.visible && (!variantId || partAllowed(mesh, variantId));
      mesh.renderOrder = state.renderOrder;
      for (const material of materialsOf(mesh)) {
        material.transparent = state.opacity < 1;
        material.opacity = state.opacity;
        material.depthWrite = state.depthWrite;
        material.needsUpdate = true;
      }
    }
  }

  function apply(refit = false): void {
    const config = currentConfig();
    const bestand = meshesOf(LEVEL_BESTAND);
    for (const variant of VARIANTS) {
      if (variant.id !== selected) setState(meshesOf(variant.levelId), HIDDEN, variant.id);
    }
    if (mode === 'bestand') {
      setState(bestand, NEUTRAL);
      setState(meshesOf(config.levelId), HIDDEN, selected);
    } else if (mode === 'ueberlagert') {
      setState(bestand, hideBestandInOverlay ? HIDDEN : OVERLAY_BESTAND);
      setState(meshesOf(config.levelId), OVERLAY_VARIANT, selected);
    } else {
      setState(bestand, HIDDEN);
      setState(meshesOf(config.levelId), NEUTRAL, selected);
    }
    hideRow.classList.toggle('is-disabled', mode !== 'ueberlagert');
    hideBox.disabled = mode !== 'ueberlagert';
    for (const [id, input] of modeRadios) input.checked = id === mode;
    const variantMeshes = meshesOf(config.levelId);
    const visibleParts = variantMeshes.filter((mesh) => mesh.visible).length;
    status.textContent = mode === 'bestand'
      ? 'Sichtbar: Bestandsdach 38°.'
      : `Sichtbar: ${config.label} · ${visibleParts} von ${variantMeshes.length} Körpern.`;
    ctx.emit('variant-mode', { mode, variantId: selected, levelId: config.levelId, hideBestandInOverlay });
    if (refit) frameAll();
    ctx.requestRender();
  }

  renderVariantDetails();
  apply(true);
  ctx.on('levels-loaded', () => {
    renderVariantDetails();
    apply(true);
  });
  ctx.on('level-visibility', (payload?: { levelId?: string }) => {
    if (payload?.levelId === LEVEL_BESTAND || payload?.levelId?.startsWith('variante')) apply();
  });
}

function materialsOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  const material = mesh.material;
  return (Array.isArray(material) ? material : [material]) as THREE.MeshStandardMaterial[];
}

function buildFigureTable(config: VariantConfig): HTMLElement {
  const table = document.createElement('div');
  table.className = 'var-figs';
  const head = document.createElement('div');
  head.className = 'var-fig-row var-fig-head';
  head.append(cell('Kennwert', 'var-fig-key'), cell('Bestand', 'var-fig-val'), cell(config.label, 'var-fig-val'));
  table.appendChild(head);
  for (const figure of config.figures) {
    const row = document.createElement('div');
    row.className = 'var-fig-row';
    row.append(
      cell(figure.label, 'var-fig-key'),
      cell(figure.bestand, 'var-fig-val'),
      cell(figure.variante, 'var-fig-val is-variant'),
    );
    table.appendChild(row);
  }
  return table;
}

function cell(text: string, className: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}
