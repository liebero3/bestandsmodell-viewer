/**
 * Einstiegspunkt: Szene aufbauen, Modelldaten laden, Feature-Module starten.
 */

import './styles.css';

import { initClipping } from './clipping.ts';
import { initEvidence } from './evidence.ts';
import { initGallery } from './gallery.ts';
import { initLayers } from './layers.ts';
import { loadModel } from './loader.ts';
import { initPicking } from './picking.ts';
import { frameAll, initScene, modelBoxMm, updateHud } from './scene.ts';
import { ctx } from './state.ts';
import { hideLoading, initTabs, setLoading, showLoadError } from './ui.ts';
import { initVariant } from './variant.ts';

async function main(): Promise<void> {
  initTabs(() => {
    // Nach dem Zurückwechseln auf das 3D-Tab muss neu gezeichnet werden.
    ctx.requestRender();
  });

  initScene();
  setLoading('Modelldaten werden geladen …');

  try {
    const { warnings } = await loadModel(setLoading);
    for (const w of warnings) console.warn('[viewer]', w);

    hideLoading();
    frameAll('iso');
    updateHud();

    if (warnings.length) {
      console.warn(
        `[viewer] ${warnings.length} Warnung(en) beim Laden — siehe oben.`,
      );
    }
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error('[viewer] Laden fehlgeschlagen:', err);
    showLoadError(
      `Die Modelldaten konnten nicht geladen werden.\n${msg}\n\n` +
        'Erwartet werden die Dateien unter public/models/ (index.json und die Ebenendateien).',
    );
  }

  // Feature-Module: jedes baut seinen eigenen DOM in seinen Container.
  initLayers(ctx, requireHost('sec-layers'));
  initVariant(ctx, requireHost('sec-variant'));
  initClipping(ctx, requireHost('sec-clipping'));
  initEvidence(ctx, requireHost('sec-evidence'));
  initPicking(ctx, requireHost('sec-picking'));
  initGallery(requireHost('tab-plans'));

  // Die Fußzeile nennt die sichtbare Höhe — sie muss jeder Sichtbarkeits-
  // änderung folgen, sonst behauptet sie einen Zustand, der nicht gilt.
  for (const ev of ['level-visibility', 'category-visibility', 'variant-mode']) {
    ctx.on(ev, () => updateHud());
  }
  updateHud();

  exposeDiagnostics();
}

function requireHost(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[viewer] Container #${id} fehlt im DOM.`);
  return el;
}

/**
 * Kleine Diagnoseschnittstelle für automatisierte Abnahmeprüfungen
 * (Playwright/Konsole). Nur lesend, keine Auswirkung auf die Darstellung.
 */
function exposeDiagnostics(): void {
  const api = {
    ctx,
    /** Hüllbox aller geladenen Meshes in Projekt-Millimetern. */
    boxMm(): Record<string, number> {
      const b = modelBoxMm();
      return {
        minX: b.min.x,
        maxX: b.max.x,
        minY: b.min.y,
        maxY: b.max.y,
        minZ: b.min.z,
        maxZ: b.max.z,
      };
    },
    /** Kennzahlen je Ebene: Meshanzahl, Dreiecke, Z-Bereich, Sichtbarkeit. */
    levelStats(): Array<Record<string, unknown>> {
      return [...ctx.levels.values()].map((level) => {
        let tris = 0;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const mesh of level.meshes) {
          const geom = mesh.geometry;
          const pos = geom.getAttribute('position');
          tris += pos.count / 3;
          geom.computeBoundingBox();
          const bb = geom.boundingBox;
          if (bb) {
            minZ = Math.min(minZ, bb.min.z);
            maxZ = Math.max(maxZ, bb.max.z);
          }
        }
        return {
          id: level.info.id,
          label: level.info.label,
          meshes: level.meshes.length,
          triangles: tris,
          minZ,
          maxZ,
          explodeRank: level.info.explode_rank,
          offsetZ: level.group.position.z,
          visible: level.group.visible,
        };
      });
    },
  };
  (window as unknown as Record<string, unknown>).viewer = api;
}

void main();
