/**
 * AP4b — Darstellung: Einfärbung nach Evidenzstatus, Sichtbarkeitsfilter.
 *
 * Materialhoheit dieses Moduls: `material.color`
 * (die Exportfarbe liegt unverändert in `mesh.userData.baseColor`).
 * Zusätzlich steuert dieses Modul `mesh.visible` — aber ausschließlich für
 * die Kategorien SPACE und OPEN. `mesh.visible` der beiden Dachebenen gehört
 * variant.ts, `group.visible` gehört layers.ts. Die drei Mengen sind
 * disjunkt (siehe state.ts), es gibt also keine Überschneidung.
 *
 * Palette: siehe EVIDENCE_CLASSES. Sie ist mit dem Validator des
 * dataviz-Skills gegen die helle Viewport-Fläche (#e8eaec) geprüft.
 */

import * as THREE from 'three';
import type { MeshUserData, ViewerContext } from './state.ts';

// --- Palette ----------------------------------------------------------------

export type EvidenceTier =
  | 'gesichert'
  | 'abgeleitet'
  | 'unsicher'
  | 'offen'
  | 'planung'
  | 'unbekannt';

export interface EvidenceClass {
  /** Schlüssel = evidence.status, bzw. 'planung' / 'unbekannt' als Sonderfälle. */
  key: string;
  /** Deutschsprachige Bezeichnung für Legende und Bauteil-Info. */
  label: string;
  tier: EvidenceTier;
  tierLabel: string;
  /** Authoring-Farbe (unbeleuchtet). Im 3D-Bild kommt die Beleuchtung dazu. */
  hex: string;
}

const TIER_LABEL: Record<EvidenceTier, string> = {
  gesichert: 'gesichert',
  abgeleitet: 'abgeleitet',
  unsicher: 'unsicher',
  offen: 'offen',
  planung: 'Planung',
  unbekannt: 'ohne Status',
};

/**
 * Reihenfolge = Anzeigereihenfolge der Legende, von gesichert nach offen.
 *
 * Farbwahl (dataviz-Skill, Status-/Kategorialpalette, mit
 * `scripts/validate_palette.js --pairs all` gegen die helle Viewport-Fläche
 * geprüft): eine Farbfamilie je Sicherheitsstufe, innerhalb der Stufe ein
 * benachbarter Farbton.
 *   gesichert  → Grün      (ruhig)
 *   abgeleitet → Blau/Violett (neutral, kein Werturteil)
 *   unsicher   → Orange/Gelb  (warnend)
 *   offen      → Rot          (alarmierend)
 *   Planung    → Magenta      (kein Bestand, sondern Entwurf)
 */
function cls(
  key: string,
  label: string,
  tier: EvidenceTier,
  hex: string,
): EvidenceClass {
  return { key, label, tier, tierLabel: TIER_LABEL[tier], hex };
}

const CLASS_LIST: EvidenceClass[] = [
  cls('documented', 'dokumentiert', 'gesichert', '#0ca30c'),
  cls('measured', 'gemessen', 'gesichert', '#1baf7a'),
  cls('scan-derived', 'aus Scan abgeleitet', 'abgeleitet', '#2a78d6'),
  cls('derived', 'rechnerisch abgeleitet', 'abgeleitet', '#4a3aa7'),
  cls('assumed', 'angenommen', 'unsicher', '#eb6834'),
  cls('user-marked', 'Nutzerentscheidung', 'unsicher', '#eda100'),
  cls('open', 'offen', 'offen', '#d03b3b'),
  cls('tbd', 'noch zu klären', 'offen', '#a32020'),
  cls('planung', 'Planung Varianten 2–4', 'planung', '#e87ba4'),
  cls('unbekannt', 'ohne Evidenzangabe', 'unbekannt', '#8a9099'),
];

const CLASS_BY_KEY = new Map<string, EvidenceClass>(CLASS_LIST.map((c) => [c.key, c]));

/** Vorab gebaute THREE.Color je Klasse — spart Allokationen beim Umschalten. */
const CLASS_COLOR = new Map<string, THREE.Color>(
  CLASS_LIST.map((c) => [c.key, new THREE.Color(c.hex)]),
);

/**
 * Anzeigeklasse eines Bauteils. `GEN_V2_*` bis `GEN_V4_*` gehoeren zu den Umbauvarianten und werden
 * als "Planung" geführt, auch wenn im Export "derived" steht.
 */
export function evidenceClassFor(data: MeshUserData): EvidenceClass {
  if (/^GEN_V[234]_/.test(data.name ?? '')) return CLASS_BY_KEY.get('planung')!;
  const status = data.evidence?.status ?? null;
  return (status && CLASS_BY_KEY.get(status)) || CLASS_BY_KEY.get('unbekannt')!;
}

/** Klasse zu einem rohen Statuswert (ohne GEN_V2_-Sonderregel). */
export function evidenceClassByStatus(status: string | null): EvidenceClass {
  return (status && CLASS_BY_KEY.get(status)) || CLASS_BY_KEY.get('unbekannt')!;
}

// --- Modul ------------------------------------------------------------------

type ColorMode = 'material' | 'evidenz';

/** Kategorien, die in der Vorgabe ausgeblendet bleiben. */
const HIDDEN_BY_DEFAULT = new Set(['SPACE', 'OPEN']);

export function initEvidence(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  let mode: ColorMode = 'material';
  const shown = new Map<string, boolean>([
    ['SPACE', false],
    ['OPEN', false],
  ]);

  // --- Umschalter Material / Evidenz ---------------------------------------

  const modeRow = document.createElement('div');
  modeRow.className = 'btn-group ev-modes';
  modeRow.setAttribute('role', 'group');
  modeRow.setAttribute('aria-label', 'Einfärbung');

  const btnMaterial = makeButton('Material', 'Originalfarben aus dem Export');
  const btnEvidenz = makeButton(
    'Evidenz',
    'Einfärbung nach Belastbarkeit der Quelle',
  );
  btnMaterial.addEventListener('click', () => setMode('material'));
  btnEvidenz.addEventListener('click', () => setMode('evidenz'));
  modeRow.append(btnMaterial, btnEvidenz);
  host.appendChild(modeRow);

  // --- Legende --------------------------------------------------------------

  const legend = document.createElement('div');
  legend.className = 'ev-legend';
  host.appendChild(legend);

  const legendNote = document.createElement('p');
  legendNote.className = 'ctl-hint ev-legend-note';
  host.appendChild(legendNote);

  // --- Sichtbarkeitsfilter --------------------------------------------------

  const sep = document.createElement('hr');
  sep.className = 'ctl-sep';
  host.appendChild(sep);

  const filters = document.createElement('div');
  filters.className = 'ev-filters';
  host.appendChild(filters);

  const spaceBox = makeCheck(
    'Raumflächen anzeigen',
    'SPACE_*: flache Raumumrisse bei Z = 12 mm, keine Bauteile',
  );
  const openBox = makeCheck(
    'Öffnungsvolumen anzeigen',
    'OPEN_*: Schneidvolumen der Fenster- und Türöffnungen',
  );
  filters.append(spaceBox.row, openBox.row);

  spaceBox.input.addEventListener('change', () => {
    shown.set('SPACE', spaceBox.input.checked);
    applyVisibility();
  });
  openBox.input.addEventListener('change', () => {
    shown.set('OPEN', openBox.input.checked);
    applyVisibility();
  });

  const openBox2 = document.createElement('details');
  openBox2.className = 'side-sub';
  const openSum = document.createElement('summary');
  openSum.textContent = 'Warum sind beide Vorgaben aus?';
  const openHint = document.createElement('p');
  openHint.className = 'ctl-hint';
  openHint.textContent =
    'Die OPEN_*-Körper sind die Schneidvolumen der Fenster- und Türöffnungen, ' +
    'keine Bauteile. Sichtbar gerendert füllen sie die Öffnungen wieder zu und ' +
    'erzeugen Z-Fighting mit den Fensterfüllungen. Die SPACE_*-Körper sind ' +
    'flache Raumumrisse dicht über dem Fußboden und verdecken im Schnitt die ' +
    'Grundrisstopologie. Beide Sätze bleiben geladen: eingeblendet sind sie ' +
    'anklickbar und liefern in der Bauteil-Info Sturz- und Brüstungshöhen ' +
    'beziehungsweise Raummaße.';
  openBox2.append(openSum, openHint);
  filters.appendChild(openBox2);

  // --- Anwenden -------------------------------------------------------------

  function setMode(next: ColorMode): void {
    mode = next;
    btnMaterial.classList.toggle('is-active', mode === 'material');
    btnEvidenz.classList.toggle('is-active', mode === 'evidenz');
    btnMaterial.setAttribute('aria-pressed', String(mode === 'material'));
    btnEvidenz.setAttribute('aria-pressed', String(mode === 'evidenz'));
    legend.classList.toggle('is-muted', mode !== 'evidenz');
    applyColors();
    ctx.requestRender();
  }

  function applyColors(): void {
    for (const mesh of ctx.allMeshes()) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const data = mesh.userData as MeshUserData;
      if (mode === 'evidenz') {
        const cls = evidenceClassFor(data);
        const color = CLASS_COLOR.get(cls.key);
        if (color) mat.color.copy(color);
      } else if (data.baseColor) {
        // Exakte Wiederherstellung: baseColor wird nie verändert.
        mat.color.copy(data.baseColor);
      }
    }
  }

  function applyVisibility(): void {
    for (const mesh of ctx.allMeshes()) {
      const cat = String((mesh.userData as MeshUserData).category ?? '');
      if (!HIDDEN_BY_DEFAULT.has(cat)) continue;
      mesh.visible = shown.get(cat) === true;
    }
    ctx.emit('category-visibility', {
      SPACE: shown.get('SPACE') === true,
      OPEN: shown.get('OPEN') === true,
    });
    ctx.requestRender();
  }

  function rebuildLegend(): void {
    const counts = new Map<string, number>();
    const rawCounts = new Map<string, number>();
    for (const mesh of ctx.allMeshes()) {
      const data = mesh.userData as MeshUserData;
      const key = evidenceClassFor(data).key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const raw = data.evidence?.status ?? 'unbekannt';
      rawCounts.set(raw, (rawCounts.get(raw) ?? 0) + 1);
    }

    legend.innerHTML = '';
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (!total) {
      const p = document.createElement('p');
      p.className = 'ctl-hint';
      p.textContent = 'Keine Bauteile geladen.';
      legend.appendChild(p);
      legendNote.textContent = '';
      return;
    }

    for (const cls of CLASS_LIST) {
      const n = counts.get(cls.key);
      if (!n) continue; // nur tatsächlich vorkommende Status zeigen
      const row = document.createElement('div');
      row.className = 'ev-row';
      row.title = `${cls.label} (${cls.tierLabel}) · ${n} Bauteile · ${cls.hex}`;

      const sw = document.createElement('span');
      sw.className = 'ev-swatch';
      sw.style.background = cls.hex;

      const lab = document.createElement('span');
      lab.className = 'ev-row-label';
      lab.textContent = cls.label;

      const tier = document.createElement('span');
      tier.className = 'ev-row-tier';
      tier.textContent = cls.tierLabel;

      const num = document.createElement('span');
      num.className = 'ctl-meta ev-row-count';
      num.textContent = String(n);

      row.append(sw, lab, tier, num);
      legend.appendChild(row);
    }

    const rawText = [...rawCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    const planung = counts.get('planung') ?? 0;
    legendNote.textContent =
      `${total} Bauteile · Rohzählung nach evidence.status: ${rawText}.` +
      (planung
        ? ` Davon werden ${planung} GEN_V2_*- bis GEN_V4_*-Körper (Rohstatus „derived“) als Planung geführt.`
        : '');
  }

  // --- Start ----------------------------------------------------------------

  function refreshAll(): void {
    rebuildLegend();
    applyVisibility();
    applyColors();
    ctx.requestRender();
  }

  // Die Meshes können beim Init bereits geladen sein (main.ts wartet auf
  // loadModel) — oder auch nicht. Beide Fälle abdecken.
  ctx.on('levels-loaded', refreshAll);
  setMode('material');
  refreshAll();
}

// --- kleine Helfer ----------------------------------------------------------

function makeButton(text: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = text;
  b.title = title;
  b.setAttribute('aria-pressed', 'false');
  return b;
}

function makeCheck(
  text: string,
  title: string,
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'ctl-check';
  row.title = title;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = false;

  const label = document.createElement('span');
  label.className = 'ctl-check-label';
  label.textContent = text;

  row.append(input, label);
  return { row, input };
}
