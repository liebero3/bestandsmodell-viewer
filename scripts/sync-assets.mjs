#!/usr/bin/env node
/** Synchronisiert den siebenteiligen Plansatz: Bestand und Varianten 2 bis 4. */

import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webviewerDir = resolve(here, '..');
const projectDir = resolve(webviewerDir, '..');
const outDir = resolve(webviewerDir, 'public/plans');

const PLAN_SPECS = [
  ['grundriss-eg', 'Grundriss EG', 'grundriss', 1, 'Grundriss_EG.svg',
    'Aktueller Erdgeschossgrundriss; das EG bleibt durch die Dachvarianten geometrisch unverändert.'],
  ['grundriss-dg', 'Grundriss DG', 'grundriss', 2, 'Grundriss_DG.svg',
    'Aktueller Dachgeschossgrundriss mit geschlossenem Balkon und den variantenspezifischen Ergänzungen.'],
  ['grundriss-atelier', 'Grundriss Atelier', 'grundriss', 3, 'Grundriss_Atelier.svg',
    'Ateliergrundriss mit den für die Variante maßgebenden Dach-, Höhen- und Erkerzonen.'],
  ['ansicht-nord', 'Ansicht Nord', 'fassade', 4, 'Ansicht_Nord.svg',
    'Orthogonale Nordfassade aus denselben parametrischen Studienkörpern wie das 3D-Modell.'],
  ['ansicht-ost', 'Ansicht Ost', 'fassade', 5, 'Ansicht_Ost.svg',
    'Orthogonale Ostfassade mit EG-, DG-, Dach- und Variantenkörpern.'],
  ['ansicht-sued', 'Ansicht Süd', 'fassade', 6, 'Ansicht_Süd.svg',
    'Orthogonale Südfassade mit den relativen und absoluten Haupthöhen.'],
  ['ansicht-west', 'Ansicht West', 'fassade', 7, 'Ansicht_West_PLACEHOLDER.svg',
    'Bemaßte Giebelseite mit Dachneigung, Kniestock, Traufe, First und variantenspezifischen Höhen.'],
];

// Der Bestand laeuft durch denselben Plansatz. Zwei Abweichungen: sein
// drittes Blatt ist der Dachboden statt des Ateliers, und seine Westansicht
// liegt seit je in qa/.
const BESTAND_QUELLE = {
  'Grundriss_Atelier.svg': 'qa/Bestand/Grundriss_Dachboden.svg',
  'Ansicht_West_PLACEHOLDER.svg': 'qa/Ansicht_West_Bestand.svg',
};
const BESTAND_TITEL = { 'Grundriss Atelier': 'Grundriss Dachboden' };
const BESTAND_BESCHREIBUNG = {
  'grundriss-atelier':
    'Dachboden auf Kehlbalkenlage +5,420, nicht ausgebaut, mit den Linien gleicher lichter Höhe.',
  'ansicht-west':
    'Bemaßte Giebelseite des Bestands mit 38° Dachneigung, Kniestock 1,103 m, Traufe und First.',
};

const CATALOG = [];
for (const variante of ['Bestand', '2', '3', '4']) {
  const istBestand = variante === 'Bestand';
  for (const [slug, titel, ansicht, reihenfolge, sourceName, beschreibung] of PLAN_SPECS) {
    const quelle = istBestand
      ? (BESTAND_QUELLE[sourceName] ?? `qa/Bestand/${sourceName}`)
      : sourceName.includes('PLACEHOLDER')
        ? `Variante_${variante}/Ansicht_West_Variante_${variante}.svg`
        : `Variante_${variante}/${sourceName}`;
    const blatt = istBestand ? (BESTAND_TITEL[titel] ?? titel) : titel;
    const dateiSlug = istBestand
      ? (slug === 'grundriss-atelier' ? 'grundriss-dachboden' : slug)
      : slug;
    CATALOG.push({
      datei: istBestand ? `bestand-${dateiSlug}.svg` : `v${variante}-${slug}.svg`,
      quelle,
      titel: istBestand ? `${blatt} — Bestand` : `${titel} — Variante ${variante}`,
      kategorie: ansicht === 'grundriss' ? 'Grundrisse' : 'Fassadenansichten',
      variante,
      ansicht,
      reihenfolge,
      beschreibung: istBestand
        ? (BESTAND_BESCHREIBUNG[slug] ?? beschreibung)
        : beschreibung,
    });
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const missing = [];
  for (const item of CATALOG) {
    if (!(await exists(resolve(projectDir, item.quelle)))) missing.push(item.quelle);
  }
  if (missing.length) {
    console.error('sync-assets abgebrochen — Quelldatei(en) nicht gefunden:');
    for (const name of missing) console.error(`  ${resolve(projectDir, name)}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(outDir, { recursive: true });
  for (const item of CATALOG) {
    await copyFile(resolve(projectDir, item.quelle), resolve(outDir, item.datei));
    console.log(`  kopiert  ${item.quelle}  ->  public/plans/${item.datei}`);
  }

  const wanted = new Set(CATALOG.map((item) => item.datei));
  for (const name of await readdir(outDir)) {
    if (!name.toLowerCase().endsWith('.svg') || wanted.has(name)) continue;
    await rm(resolve(outDir, name));
    console.log(`  entfernt  public/plans/${name}`);
  }

  const index = {
    schema: 'hausmodell-plans/2',
    plaene: CATALOG.map((item) => ({
      titel: item.titel,
      kategorie: item.kategorie,
      variante: item.variante,
      ansicht: item.ansicht,
      reihenfolge: item.reihenfolge,
      datei: item.datei,
      quelle: item.quelle,
      beschreibung: item.beschreibung,
    })),
  };
  await writeFile(resolve(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`\n${CATALOG.length} Variantenpläne und index.json synchronisiert.`);
}

main().catch((error) => {
  console.error('sync-assets fehlgeschlagen:', error);
  process.exitCode = 1;
});
