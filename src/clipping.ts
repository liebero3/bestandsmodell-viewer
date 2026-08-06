/**
 * AP6 — Schnitte: verschiebbare horizontale und vertikale Schnittebenen.
 *
 * Materialhoheit dieses Moduls: `material.clippingPlanes`. Der Renderer läuft
 * mit `localClippingEnabled = true`, die Materialien mit `side: DoubleSide`.
 *
 * Die Ebenen arbeiten in WELTKOORDINATEN, also in Metern (ctx.root skaliert
 * mm → m). Bezug der angezeigten Koten ist Z = 0 = EG-FFB; die absolute Kote
 * kommt aus manifest.z0_abs_m.
 *
 * Bewusst KEINE Stencil-Kappflächen: die Körper erscheinen im Schnitt hohl.
 */

import * as THREE from 'three';
import { modelBoxMm, setView } from './scene.ts';
import type { ViewerContext } from './state.ts';

type Axis = 'x' | 'y';

/** Fallback-Grundriss in mm, falls beim Init noch nichts geladen ist. */
const FALLBACK = { minX: 0, maxX: 10485, minY: 0, maxY: 9865 };

const H_MIN_M = -0.2;
const H_MAX_M = 9.5;

export function initClipping(ctx: ViewerContext, host: HTMLElement): void {
  host.innerHTML = '';

  const z0 = ctx.manifest?.z0_abs_m ?? 10.67;

  // Zustand
  let hOn = false;
  let hZ = 1.0; // m über EG-FFB
  let hKeepBelow = true; // true = oberhalb wegschneiden
  let vOn = false;
  let vAxis: Axis = 'y';
  let vPos = 0; // m
  let vKeepPlus = true; // true = alles unterhalb der Kote wegschneiden (Blick von -Achse)

  const hPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const vPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // --- Horizontalschnitt ----------------------------------------------------

  const hSec = document.createElement('div');
  hSec.className = 'clip-sec';
  host.appendChild(hSec);

  const hCheck = makeCheck('Horizontalschnitt', 'Waagerechte Schnittebene ein-/ausschalten');
  hSec.appendChild(hCheck.row);

  const hBody = document.createElement('div');
  hBody.className = 'clip-body';
  hSec.appendChild(hBody);

  const hRead = document.createElement('div');
  hRead.className = 'clip-read';
  hBody.appendChild(hRead);

  const hSlider = document.createElement('input');
  hSlider.type = 'range';
  hSlider.min = String(H_MIN_M);
  hSlider.max = String(H_MAX_M);
  hSlider.step = '0.01';
  hSlider.value = String(hZ);
  hSlider.setAttribute('aria-label', 'Schnitthöhe über EG-FFB in Metern');
  hBody.appendChild(hSlider);

  const hDir = document.createElement('button');
  hDir.type = 'button';
  hDir.className = 'btn';
  hDir.title = 'Umschalten, welche Seite der Ebene weggeschnitten wird';
  hBody.appendChild(hDir);

  // --- Vertikalschnitt ------------------------------------------------------

  const sep = document.createElement('hr');
  sep.className = 'ctl-sep';
  host.appendChild(sep);

  const vSec = document.createElement('div');
  vSec.className = 'clip-sec';
  host.appendChild(vSec);

  const vCheck = makeCheck('Vertikalschnitt', 'Senkrechte Schnittebene ein-/ausschalten');
  vSec.appendChild(vCheck.row);

  const vBody = document.createElement('div');
  vBody.className = 'clip-body';
  vSec.appendChild(vBody);

  const axisRow = document.createElement('div');
  axisRow.className = 'btn-group';
  axisRow.setAttribute('role', 'group');
  axisRow.setAttribute('aria-label', 'Schnittachse');
  const btnX = makeButton('Achse X', 'Ebene senkrecht zu X (Blick nach Osten)');
  const btnY = makeButton('Achse Y', 'Ebene senkrecht zu Y (Blick nach Norden)');
  axisRow.append(btnX, btnY);
  vBody.appendChild(axisRow);

  const vRead = document.createElement('div');
  vRead.className = 'clip-read';
  vBody.appendChild(vRead);

  const vSlider = document.createElement('input');
  vSlider.type = 'range';
  vSlider.step = '0.01';
  vSlider.setAttribute('aria-label', 'Lage der senkrechten Schnittebene in Metern');
  vBody.appendChild(vSlider);

  const vDir = document.createElement('button');
  vDir.type = 'button';
  vDir.className = 'btn';
  vDir.title = 'Umschalten, welche Seite der Ebene weggeschnitten wird';
  vBody.appendChild(vDir);

  // --- Vorgaben -------------------------------------------------------------

  const sep2 = document.createElement('hr');
  sep2.className = 'ctl-sep';
  host.appendChild(sep2);

  const presets = document.createElement('div');
  presets.className = 'btn-group';
  host.appendChild(presets);

  presets.appendChild(
    makeButton('Grundriss EG (+1,00 m)', 'Waagerechter Schnitt 1,00 m über EG-FFB, Draufsicht', () =>
      preset('eg'),
    ),
  );
  presets.appendChild(
    makeButton('Grundriss DG (+3,90 m)', 'Waagerechter Schnitt 3,90 m über EG-FFB, Draufsicht', () =>
      preset('dg'),
    ),
  );
  presets.appendChild(
    makeButton('Längsschnitt', 'Senkrechter Schnitt in Gebäudelängsrichtung, Blick nach Norden', () =>
      preset('laengs'),
    ),
  );
  presets.appendChild(
    makeButton('Querschnitt', 'Senkrechter Schnitt quer zur Längsrichtung, Blick nach Osten', () =>
      preset('quer'),
    ),
  );
  presets.appendChild(
    makeButton('Schnitte aus', 'Beide Schnittebenen abschalten', () => {
      hOn = false;
      vOn = false;
      sync();
    }),
  );

  const hint = document.createElement('p');
  hint.className = 'ctl-hint';
  hint.textContent =
    'Die Körper erscheinen im Schnitt hohl — es werden keine Kappflächen erzeugt. ' +
    'Höhenkoten beziehen sich auf Z = 0 = EG-FFB = ' +
    fmt(z0, 3) +
    ' m ü. NN.';
  host.appendChild(hint);

  // --- Verdrahtung ----------------------------------------------------------

  hCheck.input.addEventListener('change', () => {
    hOn = hCheck.input.checked;
    sync();
  });
  hSlider.addEventListener('input', () => {
    hZ = Number(hSlider.value);
    if (!hOn) {
      hOn = true;
      hCheck.input.checked = true;
    }
    sync();
  });
  hDir.addEventListener('click', () => {
    hKeepBelow = !hKeepBelow;
    sync();
  });

  vCheck.input.addEventListener('change', () => {
    vOn = vCheck.input.checked;
    sync();
  });
  vSlider.addEventListener('input', () => {
    vPos = Number(vSlider.value);
    if (!vOn) {
      vOn = true;
      vCheck.input.checked = true;
    }
    sync();
  });
  vDir.addEventListener('click', () => {
    vKeepPlus = !vKeepPlus;
    sync();
  });
  btnX.addEventListener('click', () => setAxis('x'));
  btnY.addEventListener('click', () => setAxis('y'));

  ctx.on('levels-loaded', () => {
    updateSliderRange();
    sync();
  });

  // --- Ablauf ---------------------------------------------------------------

  function bounds(): { min: number; max: number } {
    const box = modelBoxMm();
    if (box.isEmpty()) {
      return vAxis === 'x'
        ? { min: FALLBACK.minX / 1000, max: FALLBACK.maxX / 1000 }
        : { min: FALLBACK.minY / 1000, max: FALLBACK.maxY / 1000 };
    }
    return vAxis === 'x'
      ? { min: box.min.x / 1000, max: box.max.x / 1000 }
      : { min: box.min.y / 1000, max: box.max.y / 1000 };
  }

  function updateSliderRange(keepValue = true): void {
    const b = bounds();
    vSlider.min = b.min.toFixed(2);
    vSlider.max = b.max.toFixed(2);
    const mid = (b.min + b.max) / 2;
    if (!keepValue || vPos < b.min || vPos > b.max) vPos = mid;
    vSlider.value = String(vPos);
  }

  function setAxis(axis: Axis): void {
    if (vAxis === axis) return;
    vAxis = axis;
    updateSliderRange(false);
    if (!vOn) {
      vOn = true;
      vCheck.input.checked = true;
    }
    sync();
  }

  function preset(which: 'eg' | 'dg' | 'laengs' | 'quer'): void {
    if (which === 'eg' || which === 'dg') {
      hOn = true;
      hZ = which === 'eg' ? 1.0 : 3.9;
      hKeepBelow = true;
      vOn = false;
      sync();
      setView('oben');
      return;
    }
    // Längsrichtung des Gebäudes ist X (10,49 m gegenüber 9,87 m).
    // Längsschnitt: Ebene senkrecht zu Y, Blick nach Norden -> Südhälfte weg.
    // Querschnitt:  Ebene senkrecht zu X, Blick nach Osten  -> Westhälfte weg.
    hOn = false;
    vOn = true;
    vAxis = which === 'laengs' ? 'y' : 'x';
    updateSliderRange(false);
    vKeepPlus = true;
    sync();
    setView(which === 'laengs' ? 'sued' : 'west');
  }

  /** Zustand -> Ebenen -> Materialien -> UI. */
  function sync(): void {
    const active: THREE.Plane[] = [];

    if (hOn) {
      if (hKeepBelow) hPlane.set(new THREE.Vector3(0, 0, -1), hZ);
      else hPlane.set(new THREE.Vector3(0, 0, 1), -hZ);
      active.push(hPlane);
    }
    if (vOn) {
      const n = new THREE.Vector3();
      if (vAxis === 'x') n.set(vKeepPlus ? 1 : -1, 0, 0);
      else n.set(0, vKeepPlus ? 1 : -1, 0);
      vPlane.set(n, vKeepPlus ? -vPos : vPos);
      active.push(vPlane);
    }

    // Neues Array je Aufruf: three erkennt Längenwechsel und kompiliert die
    // Shader dann selbst neu. Leeres Array = Clipping restlos aus.
    for (const mesh of ctx.allMeshes()) {
      const mat = mesh.material as THREE.Material;
      mat.clippingPlanes = active.length ? active.slice() : [];
    }

    updateUi();
    ctx.requestRender();
    ctx.emit('clipping', { horizontal: hOn, vertical: vOn });
  }

  function updateUi(): void {
    hCheck.input.checked = hOn;
    hBody.classList.toggle('is-off', !hOn);
    hSlider.value = String(hZ);
    hRead.innerHTML = '';
    hRead.append(
      strong(`${hZ >= 0 ? '+' : '−'}${fmt(Math.abs(hZ), 2)} m über EG-FFB`),
      dim(`${fmt(z0 + hZ, 2)} m ü. NN`),
    );
    hDir.textContent = hKeepBelow ? 'oberhalb wegschneiden' : 'unterhalb wegschneiden';

    vCheck.input.checked = vOn;
    vBody.classList.toggle('is-off', !vOn);
    btnX.classList.toggle('is-active', vAxis === 'x');
    btnY.classList.toggle('is-active', vAxis === 'y');
    btnX.setAttribute('aria-pressed', String(vAxis === 'x'));
    btnY.setAttribute('aria-pressed', String(vAxis === 'y'));
    vSlider.value = String(vPos);
    vRead.innerHTML = '';
    const dirWord =
      vAxis === 'x'
        ? vKeepPlus
          ? 'Westhälfte weg'
          : 'Osthälfte weg'
        : vKeepPlus
          ? 'Südhälfte weg'
          : 'Nordhälfte weg';
    vRead.append(
      strong(`${vAxis.toUpperCase()} = ${fmt(vPos, 2)} m`),
      dim(dirWord),
    );
    vDir.textContent = 'Seite umkehren';
  }

  // --- Start ----------------------------------------------------------------

  updateSliderRange(false);
  sync();
}

// --- Helfer -----------------------------------------------------------------

function strong(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'clip-read-main';
  el.textContent = text;
  return el;
}

function dim(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'clip-read-sub';
  el.textContent = text;
  return el;
}

function makeButton(text: string, title: string, onClick?: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = text;
  b.title = title;
  if (onClick) b.addEventListener('click', onClick);
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

function fmt(v: number, digits: number): string {
  return v.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
