/**
 * AP7 — Galerie der bemaßten 2D-Pläne.
 *
 * Die SVGs werden als echtes Vektor-SVG in die Seite eingebettet (kein
 * Rasterbild), damit Maßketten und Koten in jeder Zoomstufe scharf bleiben.
 * Zoom und Verschieben übernimmt svg-pan-zoom.
 *
 * Datenquelle: public/plans/index.json, erzeugt von
 * `npm run sync-assets` (scripts/sync-assets.mjs).
 */

import svgPanZoom from 'svg-pan-zoom';
import type { ViewerContext } from './state.ts';

/** Ein Eintrag aus public/plans/index.json. */
interface PlanEntry {
  titel: string;
  kategorie: string;
  variante: 'Bestand' | '2' | '3' | '4' | '5';
  ansicht: 'grundriss' | 'fassade' | 'schnitt' | 'berechnung';
  seiten?: {datei: string; quelle: string; titel: string}[];
  status?: string;
  stand?: string;
  reihenfolge: number;
  datei: string;
  quelle: string;
  beschreibung: string;
}

interface PlanIndex {
  schema: string;
  plaene: PlanEntry[];
  berechnungen_offen?: string[];
}

/** Basispfad der Plandaten — relativ, damit das Build überall läuft. */
const PLAN_BASE = new URL('plans/', document.baseURI).href;

/** Beim Öffnen vorausgewählter Plan. */
const requested = new URLSearchParams(window.location.search);

export function initGallery(host: HTMLElement, ctx: ViewerContext): void {
  host.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'gal-root';
  host.appendChild(root);

  // --- Linke Spalte: Planliste ---------------------------------------------
  const aside = document.createElement('div');
  aside.className = 'gal-list';
  root.appendChild(aside);

  // --- Rechte Spalte: Anzeige ----------------------------------------------
  const main = document.createElement('div');
  main.className = 'gal-main';
  root.appendChild(main);

  const bar = document.createElement('div');
  bar.className = 'gal-bar';
  main.appendChild(bar);

  const titleBox = document.createElement('div');
  titleBox.className = 'gal-titlebox';
  const title = document.createElement('h3');
  title.className = 'gal-title';
  const desc = document.createElement('p');
  desc.className = 'gal-desc';
  titleBox.append(title, desc);
  bar.appendChild(titleBox);

  const tools = document.createElement('div');
  tools.className = 'btn-group gal-tools';
  bar.appendChild(tools);

  const btnReset = mkButton(
    'Zurücksetzen',
    'Zoom und Verschiebung auf den Ausgangszustand zurücksetzen',
  );
  const btnFit = mkButton('Einpassen', 'Plan vollständig in die Fläche einpassen');
  const link = document.createElement('a');
  link.className = 'btn gal-open';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'SVG öffnen';
  link.title = 'Die SVG-Datei in einem neuen Tab öffnen';
  tools.append(btnReset, btnFit, link);
  const pagePicker = document.createElement('select');
  pagePicker.className = 'gal-page-picker';
  pagePicker.setAttribute('aria-label', 'Seite der Berechnung');
  pagePicker.hidden = true;
  main.appendChild(pagePicker);
  let currentPlan: PlanEntry | null = null;
  pagePicker.addEventListener('change', () => { if (currentPlan) void select(currentPlan, Number(pagePicker.value)); });

  const stage = document.createElement('div');
  stage.className = 'gal-stage';
  main.appendChild(stage);

  const foot = document.createElement('p');
  foot.className = 'gal-foot';
  main.appendChild(foot);

  // --- Zustand --------------------------------------------------------------

  let instance: SvgPanZoom.Instance | null = null;
  /** Laufende Ladeanforderung — verhindert, dass ein alter Fetch gewinnt. */
  let loadToken = 0;
  /**
   * SVG, das schon im DOM steht, aber noch auf eine messbare Bühnengröße
   * wartet (Tab ausgeblendet). svg-pan-zoom DARF erst danach initialisiert
   * werden: bei Größe 0 baut es eine nicht invertierbare Matrix auf und wirft
   * beim ersten fit() einen InvalidStateError.
   */
  let pendingSvg: SVGSVGElement | null = null;
  const initial = requested.get('variant') ?? document.documentElement.dataset.variant ?? 'Bestand';
  let selectedVariant: PlanEntry['variante'] = ['Bestand','2','3','4','5'].includes(initial) ? initial as PlanEntry['variante'] : 'Bestand';
  let allPlans: PlanEntry[] = [];
  let missingReports: string[] = [];
  ctx.on('variant-mode', ({mode, variantId}) => {
    const next = mode === 'bestand' ? 'Bestand' : variantId;
    if (next !== selectedVariant && allPlans.length) chooseVariant(next, false);
  });

  btnReset.addEventListener('click', () => {
    if (!instance || !stageReady()) return;
    instance.resize();
    instance.reset();
  });
  btnFit.addEventListener('click', () => fitToStage());

  // Das Tab ist beim Start ausgeblendet (display:none). Sobald die Bühne
  // erstmals Platz bekommt, wird die Instanz nachträglich aufgebaut.
  const ro = new ResizeObserver(() => {
    if (!stageReady()) return;
    if (pendingSvg) {
      const svg = pendingSvg;
      pendingSvg = null;
      createInstance(svg);
      return;
    }
    if (instance) fitToStage();
  });
  ro.observe(stage);

  function stageReady(): boolean {
    return stage.clientWidth >= 2 && stage.clientHeight >= 2;
  }

  /** Baut die Zoom-/Pan-Instanz auf. Nur bei messbarer Bühne aufrufen. */
  function createInstance(svg: SVGSVGElement): void {
    instance = svgPanZoom(svg, {
      zoomEnabled: true,
      panEnabled: true,
      controlIconsEnabled: false,
      dblClickZoomEnabled: true,
      mouseWheelZoomEnabled: true,
      preventMouseEventsDefault: true,
      fit: true,
      contain: false,
      center: true,
      minZoom: 0.2,
      maxZoom: 60,
      zoomScaleSensitivity: 0.25,
    });
    fitToStage();
  }

  // --- Laden ----------------------------------------------------------------

  void (async () => {
    let index: PlanIndex;
    try {
      const res = await fetch(PLAN_BASE + 'index.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      index = (await res.json()) as PlanIndex;
    } catch (err) {
      showError(
        'Die Planliste konnte nicht geladen werden ' +
          `(${(err as Error).message}). Bitte die Seite erneut laden.`,
      );
      return;
    }

    const plans = index.plaene ?? [];
    if (!plans.length) {
      showError('Noch keine Dokumente verfügbar. Bitte später erneut versuchen.');
      return;
    }

    allPlans = plans;
    missingReports = index.berechnungen_offen ?? [];
    buildList(plans);
    // Der Startplan muss zum voreingestellten Zustand passen, sonst zeigt die
    // Galerie ein Blatt, das in der Liste links gar nicht markiert ist.
    const start = plans.find((p) => p.variante === selectedVariant && p.datei === requested.get('plan'))
      ?? plans
        .filter((p) => p.variante === selectedVariant)
        .sort((a, b) => a.reihenfolge - b.reihenfolge)[0]
      ?? plans[0];
    void select(start, Number(requested.get('page') ?? 0));
  })();

  // --- Hilfsfunktionen ------------------------------------------------------

  function buildList(plans: PlanEntry[]): void {
    aside.innerHTML = '';

    const head = document.createElement('h2');
    head.className = 'gal-list-head';
    head.textContent = 'Variante und Unterlagen';
    aside.appendChild(head);

    const selector = document.createElement('div');
    selector.className = 'gal-variant-selector';
    aside.appendChild(selector);
    for (const id of ['Bestand', '2', '3', '4', '5'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gal-variant-btn';
      button.textContent = id === 'Bestand' ? 'Bestand' : `Variante ${id}`;
      button.classList.toggle('is-active', id === selectedVariant);
      button.setAttribute('aria-pressed', String(id === selectedVariant));
      button.dataset.variant = id;
      button.addEventListener('click', () => chooseVariant(id, true));
      selector.appendChild(button);
    }

    const filtered = plans
      .filter((plan) => plan.variante === selectedVariant)
      .sort((a, b) => a.reihenfolge - b.reihenfolge);
    const groups = new Map<string, PlanEntry[]>();
    for (const plan of filtered) {
      const label = plan.ansicht === 'grundriss' ? 'Grundrisse' : plan.ansicht === 'schnitt' ? 'Schnitte' : plan.ansicht === 'berechnung' ? 'Wohnflächenberechnungen' : 'Fassadenansichten';
      const group = groups.get(label);
      if (group) group.push(plan);
      else groups.set(label, [plan]);
    }

    for (const kategorie of ['Grundrisse', 'Schnitte', 'Fassadenansichten', 'Wohnflächenberechnungen']) {
      const items = groups.get(kategorie) ?? [];
      if (!items.length) continue;
      const gh = document.createElement('div');
      gh.className = 'gal-group';
      gh.textContent = kategorie;
      aside.appendChild(gh);

      for (const p of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gal-item';
        btn.dataset.file = p.datei;

        const t = document.createElement('span');
        t.className = 'gal-item-title';
        t.textContent = p.titel;

        const d = document.createElement('span');
        d.className = 'gal-item-desc';
        d.textContent = p.seiten ? `${p.seiten.length} Seiten · ${p.beschreibung}` : p.beschreibung;

        btn.append(t, d);
        btn.addEventListener('click', () => void select(p));
        aside.appendChild(btn);
      }
    }

    if (missingReports.includes(selectedVariant) || selectedVariant === 'Bestand') {
      const note = document.createElement('p');
      note.className = 'gal-report-note';
      note.textContent = selectedVariant === 'Bestand'
        ? 'Die Bestands-Wohnflächen stehen in den Alt-Spalten des historischen Nachweises bei Variante 5.'
        : 'Für diese Variante liegt noch keine eigene vollständige Wohnflächenberechnung vor. Der Nachweis der heutigen Variante 5 ist nicht übertragbar.';
      aside.appendChild(note);
    }
    const count = document.createElement('p');
    count.className = 'ctl-hint gal-count';
    count.textContent = `${filtered.length} Dokumente · ${selectedVariant === 'Bestand' ? 'Bestand' : 'Variante ' + selectedVariant}`;
    aside.appendChild(count);
  }

  function chooseVariant(id: PlanEntry['variante'], syncModel: boolean): void {
    if (id === selectedVariant) return;
    const previousKind = currentPlan?.ansicht;
    selectedVariant = id;
    buildList(allPlans);
    const matching = allPlans.filter(p => p.variante === id).sort((a,b) => a.reihenfolge-b.reihenfolge);
    const first = matching.find(p => p.ansicht === previousKind) ?? matching[0];
    if (first) void select(first);
    if (syncModel) {
      if (id !== 'Bestand') document.querySelector<HTMLButtonElement>(`#sec-variant button[data-variant="${id}"]`)?.click();
      document.querySelector<HTMLInputElement>(`#sec-variant input[type="radio"][value="${id === 'Bestand' ? 'bestand' : 'variante'}"]`)?.click();
    }
  }

  function markActive(datei: string): void {
    for (const el of Array.from(aside.querySelectorAll<HTMLElement>('.gal-item'))) {
      el.classList.toggle('is-active', el.dataset.file === datei);
    }
  }

  async function select(plan: PlanEntry, pageIndex = 0): Promise<void> {
    const pages = plan.seiten ?? [{datei: plan.datei, quelle: plan.quelle, titel: plan.titel}];
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pages.length) pageIndex = 0;
    const page = pages[pageIndex];
    currentPlan = plan;
    pagePicker.replaceChildren(...pages.map((p,i) => { const option = document.createElement('option'); option.value=String(i); option.textContent=`Seite ${i+1} / ${pages.length} · ${p.titel}`; return option; }));
    pagePicker.value=String(pageIndex); pagePicker.hidden=pages.length<2;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', selectedVariant);
    url.searchParams.set('plan', plan.datei);
    if (pageIndex) url.searchParams.set('page', String(pageIndex)); else url.searchParams.delete('page');
    history.replaceState(null, '', url);

    const token = ++loadToken;

    title.textContent = plan.titel;
    desc.textContent = plan.beschreibung;
    foot.textContent = `${plan.stand ? 'Nachweisstand ' + plan.stand + ' · ' : ''}Zoom mit dem Mausrad oder Einpassen; Verschieben mit gedrückter Maustaste.`;
    link.href = PLAN_BASE + page.datei;
    markActive(plan.datei);

    destroyInstance();
    stage.innerHTML = '';
    const loading = document.createElement('p');
    loading.className = 'gal-msg';
    loading.textContent = 'Plan wird geladen …';
    stage.appendChild(loading);

    let text: string;
    try {
      const res = await fetch(PLAN_BASE + page.datei, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) {
      if (token !== loadToken) return;
      showStageError(
        `"${plan.datei}" konnte nicht geladen werden (${(err as Error).message}).`,
      );
      return;
    }
    if (token !== loadToken) return;

    const svg = parseSvg(text);
    if (!svg) {
      showStageError(`"${plan.datei}" enthält kein lesbares SVG.`);
      return;
    }

    stage.innerHTML = '';
    stage.appendChild(svg);

    if (stageReady()) createInstance(svg);
    // Tab noch verborgen — der ResizeObserver baut die Instanz später auf.
    else pendingSvg = svg;
  }

  function fitToStage(): void {
    if (!instance || !stageReady()) return;
    instance.resize();
    instance.fit();
    instance.center();
  }

  function destroyInstance(): void {
    pendingSvg = null;
    if (!instance) return;
    try {
      instance.destroy();
    } catch {
      /* svg-pan-zoom wirft, wenn das SVG schon aus dem DOM ist — egal. */
    }
    instance = null;
  }

  function showError(message: string): void {
    aside.innerHTML = '';
    title.textContent = 'Keine Pläne verfügbar';
    desc.textContent = '';
    showStageError(message);
  }

  function showStageError(message: string): void {
    destroyInstance();
    stage.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'gal-msg is-error';
    p.textContent = message;
    stage.appendChild(p);
  }
}

/**
 * Parst SVG-Quelltext und bereitet das Wurzelelement für die Einbettung auf:
 * feste Prozentgröße, garantierte viewBox (svg-pan-zoom braucht sie).
 */
function parseSvg(text: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) return null;

  const src = doc.documentElement;
  if (!src || src.nodeName.toLowerCase() !== 'svg') return null;

  const svg = document.importNode(src, true) as unknown as SVGSVGElement;

  if (!svg.getAttribute('viewBox')) {
    const w = Number.parseFloat(svg.getAttribute('width') ?? '');
    const h = Number.parseFloat(svg.getAttribute('height') ?? '');
    if (Number.isFinite(w) && Number.isFinite(h)) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
  }

  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('gal-svg');
  return svg;
}

function mkButton(text: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = text;
  b.title = title;
  return b;
}
