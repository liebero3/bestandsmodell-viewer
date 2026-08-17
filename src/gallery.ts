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

/** Ein Eintrag aus public/plans/index.json. */
interface PlanEntry {
  titel: string;
  kategorie: string;
  variante: '2' | '3' | '4';
  ansicht: 'grundriss' | 'fassade';
  reihenfolge: number;
  datei: string;
  quelle: string;
  beschreibung: string;
}

interface PlanIndex {
  schema: string;
  plaene: PlanEntry[];
}

/** Basispfad der Plandaten — relativ, damit das Build überall läuft. */
const PLAN_BASE = new URL('plans/', document.baseURI).href;

/** Beim Öffnen vorausgewählter Plan. */
const START_FILE = 'v4-grundriss-eg.svg';

export function initGallery(host: HTMLElement): void {
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
  let selectedVariant: '2' | '3' | '4' = '4';

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
    if (instance) instance.resize();
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
          `(${(err as Error).message}). Bitte "npm run sync-assets" ausführen — ` +
          'das Skript legt public/plans/index.json an.',
      );
      return;
    }

    const plans = index.plaene ?? [];
    if (!plans.length) {
      showError('Die Planliste ist leer. Bitte "npm run sync-assets" ausführen.');
      return;
    }

    buildList(plans);
    const start = plans.find((p) => p.datei === START_FILE) ?? plans[0];
    void select(start);
  })();

  // --- Hilfsfunktionen ------------------------------------------------------

  function buildList(plans: PlanEntry[]): void {
    aside.innerHTML = '';

    const head = document.createElement('h2');
    head.className = 'gal-list-head';
    head.textContent = 'Variante und Plan wählen';
    aside.appendChild(head);

    const selector = document.createElement('div');
    selector.className = 'gal-variant-selector';
    aside.appendChild(selector);
    for (const id of ['2', '3', '4'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gal-variant-btn';
      button.textContent = `Variante ${id}`;
      button.classList.toggle('is-active', id === selectedVariant);
      button.addEventListener('click', () => {
        if (selectedVariant === id) return;
        selectedVariant = id;
        buildList(plans);
        const first = plans
          .filter((plan) => plan.variante === id)
          .sort((a, b) => a.reihenfolge - b.reihenfolge)[0];
        if (first) void select(first);
      });
      selector.appendChild(button);
    }

    const filtered = plans
      .filter((plan) => plan.variante === selectedVariant)
      .sort((a, b) => a.reihenfolge - b.reihenfolge);
    const groups = new Map<string, PlanEntry[]>();
    for (const plan of filtered) {
      const label = plan.ansicht === 'grundriss' ? 'Grundrisse' : 'Fassadenansichten';
      const group = groups.get(label);
      if (group) group.push(plan);
      else groups.set(label, [plan]);
    }

    for (const [kategorie, items] of groups) {
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
        d.textContent = p.beschreibung;

        btn.append(t, d);
        btn.addEventListener('click', () => void select(p));
        aside.appendChild(btn);
      }
    }

    const count = document.createElement('p');
    count.className = 'ctl-hint gal-count';
    count.textContent = `${filtered.length} Blätter in Variante ${selectedVariant}`;
    aside.appendChild(count);
  }

  function markActive(datei: string): void {
    for (const el of Array.from(aside.querySelectorAll<HTMLElement>('.gal-item'))) {
      el.classList.toggle('is-active', el.dataset.file === datei);
    }
  }

  async function select(plan: PlanEntry): Promise<void> {
    const token = ++loadToken;

    title.textContent = plan.titel;
    desc.textContent = plan.beschreibung;
    foot.textContent = `Quelle: ${plan.quelle} · Zoom mit dem Mausrad, Verschieben mit gedrückter Maustaste.`;
    link.href = PLAN_BASE + plan.datei;
    markActive(plan.datei);

    destroyInstance();
    stage.innerHTML = '';
    const loading = document.createElement('p');
    loading.className = 'gal-msg';
    loading.textContent = 'Plan wird geladen …';
    stage.appendChild(loading);

    let text: string;
    try {
      const res = await fetch(PLAN_BASE + plan.datei, { cache: 'no-cache' });
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
