/**
 * AP3 — Ebenen: Sichtbarkeit je Geschoss/Dach und Explosionsansicht.
 *
 * Zuständigkeit dieses Moduls: `LevelGroup.group.visible` und
 * `LevelGroup.group.position.z`. Materialeigenschaften fasst es nicht an.
 */

import type { ViewerContext } from './state.ts';

/** Versatz je Explosionsrang bei 100 % (Projekt-Millimeter). */
const EXPLODE_STEP_MM = 2500;

export function initLayers(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  const levels = ctx.manifest?.levels ?? [];
  if (!levels.length) {
    const p = document.createElement('p');
    p.className = 'ctl-hint';
    p.textContent = 'Keine Ebenen geladen.';
    host.appendChild(p);
    return;
  }

  const boxes = new Map<string, HTMLInputElement>();

  // --- Alle an / alle aus ---
  const bulk = document.createElement('div');
  bulk.className = 'btn-group';
  bulk.appendChild(
    makeButton('Alle an', () => setAll(true), 'Alle Ebenen einblenden'),
  );
  bulk.appendChild(
    makeButton('Alle aus', () => setAll(false), 'Alle Ebenen ausblenden'),
  );
  host.appendChild(bulk);

  const sep = document.createElement('hr');
  sep.className = 'ctl-sep';
  host.appendChild(sep);

  // --- Eine Checkbox je Ebene ---
  const list = document.createElement('div');
  list.className = 'lay-list';
  host.appendChild(list);

  for (const info of levels) {
    const level = ctx.levels.get(info.id);

    const row = document.createElement('label');
    row.className = 'ctl-check';
    row.title =
      `${info.label} · Z ${fmtM(info.z_base)} bis ${fmtM(info.z_top)} m ` +
      `über EG-FFB · ${level?.meshes.length ?? 0} Bauteile`;

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = level ? level.group.visible : false;
    box.disabled = !level || level.meshes.length === 0;
    box.addEventListener('change', () => {
      applyVisibility(info.id, box.checked);
      ctx.requestRender();
    });
    boxes.set(info.id, box);

    const swatch = document.createElement('span');
    swatch.className = 'ctl-swatch';
    swatch.style.background = levelSwatch(ctx, info.id);

    const label = document.createElement('span');
    label.className = 'ctl-check-label';
    label.textContent = info.label;

    row.append(box, swatch, label);

    if (info.variant) {
      const tag = document.createElement('span');
      tag.className = 'lay-variant-tag';
      tag.textContent = 'Var';
      tag.title = 'Gehört zur Umbauvariante, nicht zum Bestand';
      row.appendChild(tag);
    }

    const meta = document.createElement('span');
    meta.className = 'ctl-meta';
    meta.textContent = `${fmtM(info.z_base)}–${fmtM(info.z_top)}`;
    row.appendChild(meta);

    list.appendChild(row);
  }

  // --- Explosionsansicht ---
  const sep2 = document.createElement('hr');
  sep2.className = 'ctl-sep';
  host.appendChild(sep2);

  const explode = document.createElement('div');
  explode.className = 'lay-explode';

  const head = document.createElement('div');
  head.className = 'lay-explode-head';
  const headLabel = document.createElement('span');
  headLabel.className = 'ctl-label';
  headLabel.textContent = 'Explosionsansicht';
  const headVal = document.createElement('span');
  headVal.className = 'lay-explode-val';
  headVal.textContent = '0 %';
  head.append(headLabel, headVal);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = '0';
  slider.setAttribute('aria-label', 'Explosionsansicht in Prozent');

  const hint = document.createElement('p');
  hint.className = 'ctl-hint';
  hint.textContent =
    `100 % = ${fmtM(EXPLODE_STEP_MM)} m Versatz je Ebenenrang. ` +
    'Bestandsdach und Variante 2 haben denselben Rang und bleiben deckungsgleich.';

  slider.addEventListener('input', () => {
    const pct = Number(slider.value);
    headVal.textContent = `${pct} %`;
    applyExplode(pct / 100);
    ctx.requestRender();
  });

  explode.append(head, slider, hint);
  host.appendChild(explode);

  // Startzustand sauber setzen (Versatz exakt 0).
  applyExplode(0);

  // --- Hilfsfunktionen -----------------------------------------------------

  function applyVisibility(levelId: string, visible: boolean): void {
    const level = ctx.levels.get(levelId);
    if (!level) return;
    level.group.visible = visible;
    ctx.emit('level-visibility', { levelId, visible });
  }

  function setAll(visible: boolean): void {
    for (const [id, box] of boxes) {
      if (box.disabled) continue;
      box.checked = visible;
      applyVisibility(id, visible);
    }
    ctx.requestRender();
  }

  function applyExplode(factor: number): void {
    for (const level of ctx.levels.values()) {
      const offset = factor * level.info.explode_rank * EXPLODE_STEP_MM;
      // Exakt 0 setzen, damit 0 % den Ausgangszustand bitgenau herstellt.
      level.group.position.z = factor === 0 ? 0 : offset;
    }
    ctx.emit('explode', { factor });
  }
}

/** Repräsentative Farbe einer Ebene für das Farbfeld in der Liste. */
function levelSwatch(ctx: ViewerContext, levelId: string): string {
  const level = ctx.levels.get(levelId);
  const meshes = level?.meshes ?? [];
  if (!meshes.length) return '#5a6068';
  // Farbe des flächengrößten Bauteils annähern: das mit den meisten Dreiecken.
  let best = meshes[0];
  let bestCount = -1;
  for (const m of meshes) {
    const pos = (m.geometry as { attributes: { position?: { count: number } } })
      .attributes.position;
    const count = pos?.count ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = m;
    }
  }
  const color = (best.userData as { baseColor?: { getHexString(): string } })
    .baseColor;
  return color ? `#${color.getHexString()}` : '#5a6068';
}

function makeButton(text: string, onClick: () => void, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function fmtM(mm: number): string {
  return (mm / 1000).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
