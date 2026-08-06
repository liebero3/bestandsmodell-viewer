/**
 * Lädt Manifest und Ebenendateien aus public/models/ und baut daraus
 * je Ebene eine THREE.Group mit einzelnen Meshes.
 *
 * Bewusst KEINE Geometrie-Merges: Picking (AP4), Evidenzfärbung (AP4) und
 * Varianten-Transparenz (AP5) brauchen jedes Bauteil als eigenes Objekt.
 */

import * as THREE from 'three';
import { ctx, type LevelGroup, type MeshUserData } from './state.ts';
import type { Manifest, MeshEntry, MeshFile } from './types.ts';

/** Basispfad der Modelldaten — relativ, damit das Build überall läuft. */
const MODEL_BASE = new URL('models/', document.baseURI).href;

const MANIFEST_SCHEMA = 'hausmodell-manifest/1';
const MESH_SCHEMA = 'hausmodell-mesh/1';

/**
 * Lädt alles und hängt es unter `ctx.root`. Wirft bei nicht behebbaren
 * Fehlern (Manifest fehlt/kaputt); fehlende Einzeldateien werden gemeldet,
 * blockieren aber den Rest nicht.
 */
export async function loadModel(
  onProgress?: (text: string) => void,
): Promise<{ levels: LevelGroup[]; warnings: string[] }> {
  onProgress?.('Manifest wird geladen …');
  const manifest = await fetchJson<Manifest>(MODEL_BASE + 'index.json');

  if (manifest.schema !== MANIFEST_SCHEMA) {
    throw new Error(
      `Unerwartetes Manifest-Schema "${manifest.schema}" (erwartet "${MANIFEST_SCHEMA}").`,
    );
  }
  if (manifest.units !== 'mm') {
    throw new Error(`Unerwartete Einheit "${manifest.units}" (erwartet "mm").`);
  }
  ctx.manifest = manifest;

  onProgress?.(`${manifest.levels.length} Ebenen werden geladen …`);

  const warnings: string[] = [];
  const results = await Promise.all(
    manifest.levels.map(async (info) => {
      try {
        const file = await fetchJson<MeshFile>(MODEL_BASE + info.file);
        if (file.schema !== MESH_SCHEMA) {
          warnings.push(
            `${info.file}: unerwartetes Schema "${file.schema}" — trotzdem geladen.`,
          );
        }
        return { info, file };
      } catch (err) {
        warnings.push(
          `Ebene "${info.label}" (${info.file}) konnte nicht geladen werden: ${
            (err as Error).message
          }`,
        );
        return { info, file: null };
      }
    }),
  );

  const levels: LevelGroup[] = [];
  for (const { info, file } of results) {
    const group = new THREE.Group();
    group.name = `level:${info.id}`;
    group.userData.levelId = info.id;

    const meshes: THREE.Mesh[] = [];
    for (const entry of file?.meshes ?? []) {
      const mesh = buildMesh(entry, info.id);
      if (!mesh) {
        warnings.push(`${info.id}/${entry.name}: leere Geometrie, übersprungen.`);
        continue;
      }
      group.add(mesh);
      meshes.push(mesh);
    }

    ctx.root.add(group);
    const level: LevelGroup = { info, group, meshes };
    ctx.levels.set(info.id, level);
    levels.push(level);
  }

  ctx.emit('levels-loaded', levels);
  ctx.requestRender();
  return { levels, warnings };
}

/** Baut ein einzelnes Mesh aus einem Exporteintrag. */
function buildMesh(entry: MeshEntry, levelId: string): THREE.Mesh | null {
  if (!entry.positions?.length || !entry.indices?.length) return null;

  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(entry.positions), 3),
  );
  geometry.setIndex(entry.indices);

  // Flat Shading braucht eigenständige Dreiecke; danach Normalen neu bilden.
  geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const [r, g, b] = entry.color;
  const baseColor = new THREE.Color().setRGB(
    r / 255,
    g / 255,
    b / 255,
    THREE.SRGBColorSpace,
  );

  const material = new THREE.MeshStandardMaterial({
    color: baseColor.clone(),
    flatShading: true,
    side: THREE.DoubleSide, // Schnittflächen bleiben beim Clipping sichtbar
    roughness: 0.82,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = entry.name;

  const data: MeshUserData = {
    name: entry.name,
    label: entry.label,
    category: entry.category,
    levelId,
    evidence: entry.evidence,
    baseColor,
  };
  mesh.userData = data;

  return mesh;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
  return (await res.json()) as T;
}
