/**
 * AP4a — Bauteil-Info: Raycast-Auswahl, Hervorhebung und Metadatenanzeige.
 *
 * Materialhoheit dieses Moduls: `material.emissive` und
 * `material.emissiveIntensity`. Farben gehören evidence.ts, Transparenz
 * gehört variant.ts, Schnittebenen gehören clipping.ts.
 *
 * Auswahl nur bei echtem Klick: liegt zwischen pointerdown und pointerup mehr
 * als CLICK_SLOP_PX Weg, war es ein Orbit-/Pan-Zug und keine Auswahl.
 */

import * as THREE from 'three';
import { evidenceClassFor } from './evidence.ts';
import type { MeshUserData, ViewerContext } from './state.ts';
import type { Evidence } from './types.ts';

/** Bis zu diesem Zeigerweg (CSS-Pixel) gilt ein Zug noch als Klick. */
const CLICK_SLOP_PX = 4;

/** Hervorhebung: neutrales, kühles Grau — hellt auf, ohne den Farbton zu kippen. */
const HIGHLIGHT_EMISSIVE = new THREE.Color('#6b7480');
const HIGHLIGHT_INTENSITY = 1.0;

const CATEGORY_LABEL: Record<string, string> = {
  ARC: 'ARC · Architektur / Ausbau',
  STR: 'STR · Tragwerk',
  OPEN: 'OPEN · Öffnungsvolumen (Schneidkörper)',
  SPACE: 'SPACE · Raumfläche',
  GEN: 'GEN · Hüllkörper',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'hoch',
  medium: 'mittel',
  low: 'gering',
};

interface Saved {
  emissive: THREE.Color;
  intensity: number;
}

export function initPicking(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'pick-panel';
  panel.setAttribute('aria-live', 'polite');
  host.appendChild(panel);

  let selected: THREE.Mesh | null = null;
  let saved: Saved | null = null;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const canvas = ctx.renderer.domElement;

  renderPanel(null);

  // --- Zeigerauswertung -----------------------------------------------------

  let downX = 0;
  let downY = 0;
  let downId: number | null = null;

  canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    downId = ev.pointerId;
    downX = ev.clientX;
    downY = ev.clientY;
  });

  canvas.addEventListener('pointerup', (ev: PointerEvent) => {
    if (ev.button !== 0 || downId !== ev.pointerId) return;
    downId = null;
    const dx = ev.clientX - downX;
    const dy = ev.clientY - downY;
    if (Math.hypot(dx, dy) > CLICK_SLOP_PX) return; // war ein Orbit-/Pan-Zug
    select(pickAt(ev.clientX, ev.clientY));
  });

  canvas.addEventListener('pointercancel', () => {
    downId = null;
  });

  // Zeigerform: über pickbaren Bauteilen "pointer". Auswertung höchstens
  // einmal je Frame, und nie während eines Zugs.
  let hoverPending = false;
  let hoverX = 0;
  let hoverY = 0;

  canvas.addEventListener('pointermove', (ev: PointerEvent) => {
    if (ev.pointerType !== 'mouse') return;
    if (downId !== null) return;
    hoverX = ev.clientX;
    hoverY = ev.clientY;
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      canvas.style.cursor = pickAt(hoverX, hoverY) ? 'pointer' : '';
    });
  });

  canvas.addEventListener('pointerleave', () => {
    canvas.style.cursor = '';
  });

  window.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !selected) return;
    select(null);
  });

  // Wird ein ausgewähltes Bauteil unsichtbar (Ebene aus, Kategoriefilter,
  // Variantenmodus), bleibt die Info stehen, aber die Hervorhebung wäre
  // verwaist — aufräumen. Der Variantenmodus ist der wichtigste Fall: er
  // schaltet mesh.visible der beiden Dachebenen um.
  ctx.on('level-visibility', dropIfHidden);
  ctx.on('category-visibility', dropIfHidden);
  ctx.on('variant-mode', dropIfHidden);
  ctx.on('levels-loaded', () => select(null));

  function dropIfHidden(): void {
    if (selected && !isPickable(selected)) select(null);
  }

  // --- Auswahl --------------------------------------------------------------

  function select(mesh: THREE.Mesh | null): void {
    if (mesh === selected) return;

    // Vorzustand exakt wiederherstellen.
    if (selected && saved) {
      const mat = selected.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(saved.emissive);
      mat.emissiveIntensity = saved.intensity;
    }
    selected = null;
    saved = null;

    if (mesh) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      saved = { emissive: mat.emissive.clone(), intensity: mat.emissiveIntensity };
      mat.emissive.copy(HIGHLIGHT_EMISSIVE);
      mat.emissiveIntensity = HIGHLIGHT_INTENSITY;
      selected = mesh;
    }

    renderPanel(selected);
    ctx.emit('selection', selected);
    ctx.requestRender();
  }

  /** Erstes sichtbares, nicht weggeschnittenes Bauteil unter dem Zeiger. */
  function pickAt(clientX: number, clientY: number): THREE.Mesh | null {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, ctx.camera);

    const candidates = ctx.allMeshes().filter(isPickable);
    if (!candidates.length) return null;

    const hits = raycaster.intersectObjects(candidates, false);
    for (const hit of hits) {
      // Der Raycaster kennt die Schnittebenen nicht — weggeschnittene
      // Treffer selbst verwerfen, sonst wählt man Unsichtbares aus.
      if (isClippedAway(hit.object as THREE.Mesh, hit.point)) continue;
      return hit.object as THREE.Mesh;
    }
    return null;
  }

  function isPickable(mesh: THREE.Mesh): boolean {
    if (!mesh.visible) return false;
    const level = ctx.levels.get((mesh.userData as MeshUserData).levelId);
    if (level && !level.group.visible) return false;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat || mat.visible === false) return false;
    if (mat.transparent && mat.opacity < 0.05) return false;
    return true;
  }

  // --- Infopanel ------------------------------------------------------------

  function renderPanel(mesh: THREE.Mesh | null): void {
    panel.innerHTML = '';

    if (!mesh) {
      const hint = document.createElement('p');
      hint.className = 'ctl-hint';
      hint.textContent =
        'Bauteil im Modell anklicken. Ziehen dreht die Ansicht, Esc hebt die Auswahl auf.';
      panel.appendChild(hint);
      return;
    }

    const data = mesh.userData as MeshUserData;
    const ev: Evidence = data.evidence ?? {
      status: null,
      confidence: null,
      source: null,
      page: null,
      details: {},
    };
    const cls = evidenceClassFor(data);

    const title = document.createElement('p');
    title.className = 'pick-title';
    title.textContent = data.label || data.name;
    panel.appendChild(title);

    const name = document.createElement('p');
    name.className = 'pick-name';
    name.textContent = data.name;
    panel.appendChild(name);

    // Evidenzbadge
    const badge = document.createElement('span');
    badge.className = 'pick-badge';
    badge.style.setProperty('--badge-color', cls.hex);
    badge.title = `Evidenzstufe: ${cls.tierLabel}`;
    const dot = document.createElement('span');
    dot.className = 'pick-badge-dot';
    const badgeText = document.createElement('span');
    badgeText.textContent = `${cls.label} · ${cls.tierLabel}`;
    badge.append(dot, badgeText);

    const badgeRow = document.createElement('div');
    badgeRow.className = 'pick-badge-row';
    badgeRow.appendChild(badge);
    panel.appendChild(badgeRow);

    // Kennwerte
    const dl = document.createElement('dl');
    dl.className = 'pick-dl';
    addRow(dl, 'Ebene', ctx.levels.get(data.levelId)?.info.label ?? data.levelId);
    addRow(dl, 'Kategorie', CATEGORY_LABEL[String(data.category)] ?? String(data.category));
    addRow(dl, 'Rohstatus', ev.status ?? '—');
    addRow(
      dl,
      'Konfidenz',
      ev.confidence ? (CONFIDENCE_LABEL[ev.confidence] ?? ev.confidence) : '—',
    );
    addRow(dl, 'Quelle', ev.source ?? '—');
    addRow(dl, 'Seite', ev.page ?? '—');

    const geo = geometryFacts(mesh);
    if (geo) {
      addRow(dl, 'Abmessungen', geo.size);
      addRow(dl, 'Höhenlage', geo.z);
    }
    panel.appendChild(dl);

    // Details (mehrzeilige Freitexte, z. B. GeometryEvidence)
    const details = Object.entries(ev.details ?? {}).filter(([, v]) => v && String(v).trim());
    if (details.length) {
      const box = document.createElement('details');
      box.className = 'pick-details';
      const sum = document.createElement('summary');
      sum.textContent = `Belege und Anmerkungen (${details.length})`;
      box.appendChild(sum);

      const inner = document.createElement('dl');
      inner.className = 'pick-dl pick-dl--stacked';
      for (const [k, v] of details) addRow(inner, k, String(v));
      box.appendChild(inner);
      panel.appendChild(box);
    }

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn pick-clear';
    clear.textContent = 'Auswahl aufheben';
    clear.addEventListener('click', () => select(null));
    panel.appendChild(clear);
  }

  /** Maße und Höhenlage aus der Rohgeometrie (Projekt-Millimeter). */
  function geometryFacts(mesh: THREE.Mesh): { size: string; z: string } | null {
    const geom = mesh.geometry as THREE.BufferGeometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return null;
    const s = bb.getSize(new THREE.Vector3());
    const z0 = ctx.manifest?.z0_abs_m ?? 0;
    return {
      size: `${fmtM(s.x)} × ${fmtM(s.y)} × ${fmtM(s.z)} m`,
      z:
        `${fmtM(bb.min.z)} bis ${fmtM(bb.max.z)} m über EG-FFB ` +
        `(OK ${fmt(z0 + bb.max.z / 1000)} m ü. NN)`,
    };
  }
}

// --- Helfer -----------------------------------------------------------------

function isClippedAway(mesh: THREE.Mesh, point: THREE.Vector3): boolean {
  const mat = mesh.material as THREE.Material;
  const planes = mat?.clippingPlanes;
  if (!planes || !planes.length) return false;
  for (const plane of planes) {
    if (plane.distanceToPoint(point) < 0) return true;
  }
  return false;
}

function addRow(dl: HTMLDListElement, key: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = key;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}

function fmtM(mm: number): string {
  return fmt(mm / 1000);
}

function fmt(m: number): string {
  return m.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
