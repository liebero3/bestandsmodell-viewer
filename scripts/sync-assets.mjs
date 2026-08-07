#!/usr/bin/env node
/**
 * Kopiert die kuratierten SVG-Pläne aus dem Projekt nach
 * webviewer/public/plans/ und schreibt dort ein index.json für die Galerie.
 *
 * Aufruf:  npm run sync-assets
 * Keine Fremdabhängigkeiten, reines Node.
 *
 * Eigenschaften:
 *   - Quelldateien werden ausschließlich gelesen, nie verändert.
 *   - Idempotent: derselbe Lauf erzeugt bitgleiche Ergebnisse (kein
 *     Zeitstempel im index.json), verwaiste SVGs im Zielordner werden
 *     entfernt.
 *   - Fehlt eine Quelldatei, bricht das Skript mit klarer Meldung ab
 *     (Exit-Code 1) und schreibt kein unvollständiges index.json.
 *
 * Der Katalog ist bewusst kuratiert: qa/ enthält auch reine Zwischenstands-
 * und Prüfbilder, die nicht in eine Präsentation gehören. Die
 * Beschreibungen sind aus dem tatsächlichen Zeichnungsinhalt abgeleitet.
 */

import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webviewerDir = resolve(here, '..');
const projectDir = resolve(webviewerDir, '..');
const outDir = resolve(webviewerDir, 'public/plans');

/**
 * Kuratierter Katalog.
 *   datei       — Zieldateiname in public/plans/
 *   quelle      — Pfad relativ zum Projektwurzelverzeichnis
 *   titel       — aus dem Zeichnungsinhalt abgeleitet, nicht aus dem Dateinamen
 *   kategorie   — Gruppierung in der Galerie
 *   beschreibung— was auf dem Blatt tatsächlich zu sehen ist
 */
const CATALOG = [
  {
    datei: 'eg-grundriss.svg',
    quelle: 'qa/EG_Grundriss_bemasst.svg',
    titel: 'Grundriss Erdgeschoss — bemaßt',
    kategorie: 'Grundrisse',
    beschreibung:
      'Wohnen/Essen, Küche, Diele, HWR, WC und Freisitz mit durchgehenden ' +
      'Außen- und Innenmaßketten in Millimetern (Gesamtbreite 10.485, ' +
      'Gebäudetiefe 9.865). Wandstärken 300/175/115 mm sind in der Legende ' +
      'erklärt, die Treppe trägt die Laufrichtungen „AUF DG“ und „AB KG“. ' +
      'Schwarze Maße sind dokumentiert bzw. nutzerbestätigt, orange mit ' +
      'Stern markierte sind scan-abgeleitet und aufmaßpflichtig. ' +
      'Ohne Türanschläge und Möblierung.',
  },
  {
    datei: 'dg-grundriss.svg',
    quelle: 'qa/DG_V22_Grundriss_bemasst.svg',
    titel: 'Grundriss Dachgeschoss — bemaßt (Modellstand V21)',
    kategorie: 'Grundrisse',
    beschreibung:
      'Schnitt bei Z = +3.000 mm (70 mm über DG-FFB) mit Kind 1, Kind 2, ' +
      'Eltern, Bad, Flur und der unbeheizten Loggia, jeweils mit lichten ' +
      'Raummaßen, dazu Fenster- und Türlisten (F1–F3, FT, T1–T4) und der ' +
      'Kamin 500/600. Die Maßketten sind benannt (DG-S1, DG-N1 … DG-O1) und ' +
      'farblich nach Evidenzstatus unterschieden. Die Hinweisspalte hält den ' +
      'aufgelösten 300-mm-Nordkonflikt (Band Y = 8.740…9.040) und die noch ' +
      'aufmaßpflichtigen Stellen fest; die Stufenzahl der Treppe ist tbd.',
  },
  {
    datei: 'ansicht-west-bestand.svg',
    quelle: 'qa/Ansicht_West_Bestand.svg',
    titel: 'Westansicht Giebelseite — Bestand (38°)',
    kategorie: 'Ansichten',
    beschreibung:
      'Blick von Westen, Norden links, Süden rechts. Höhenkoten in Metern ' +
      'über NN: EG-FFB 10,67 · DG-FFB 13,60 · Kehlbalkenlage 16,09 · ' +
      'First 18,158. OK Traufe Süd 14,72, Nord 13,888*, Kniestock Süd 1,103, ' +
      'Dachneigung 38°. Verdeckte Innenwände sind gestrichelt, Fenster- und ' +
      'Türöffnungen mit Breite/Höhe beschriftet. Mit * markierte Stationen ' +
      'sind scan- oder modellabgeleitet; das Kellergeschoss ist nicht ' +
      'modelliert.',
  },
  {
    datei: 'ansicht-west-variante1.svg',
    quelle: 'Variante_1/Ansicht_West_Variante_1.svg',
    titel: 'Westansicht Giebelseite — Variante 1 (Kniestock +1,24 m, 38°)',
    kategorie: 'Ansichten',
    beschreibung:
      'Dieselbe Westansicht mit unverändert 38° Dachneigung, aber um ' +
      '+1,24 m angehobenem Dachprofil: First 19,398, OK Traufe Süd 15,96, ' +
      'Kniestock Süd 2,343. Die Kehlbalkenlage 16,09 bleibt Atelierboden, das ' +
      'Atelier erreicht lichte 3,00 × 2,00 m. Das Bestandsdach ist zum ' +
      'Vergleich dünn mitgezeichnet.',
  },
  {
    datei: 'ansicht-west-variante2.svg',
    quelle: 'Variante_2/Ansicht_West_Variante_2.svg',
    titel: 'Westansicht Giebelseite — Variante 2 (45°, Kniestock +0,79 m)',
    kategorie: 'Ansichten',
    beschreibung:
      'Die gewählte Variante: Dachneigung von 38° auf 45° erhöht, Traufen um ' +
      '+0,79 m angehoben. First 20,042 (+1,88), OK Traufe Süd 15,526, ' +
      'Nord 14,694*, Kniestock Süd 1,926. Das Atelier auf der Kehlbalkenlage ' +
      '16,09 erreicht lichte 3,00 × 2,30 m, der innere First liegt 3,80 m ' +
      'darüber. Das Bestandsdach ist als dünne Kontur überlagert, die ' +
      'Traufanhebung eigens bemaßt. Kompletter Dachstuhl-Neubau, kein ' +
      'Standsicherheitsnachweis.',
  },
  {
    datei: 'schnitt-dg-dachboden.svg',
    quelle: 'qa/DG_Dachboden_V15_Section.svg',
    titel: 'Höhenschnitt Dachgeschoss und Dachboden (Bestand)',
    kategorie: 'Schnitte und 3D',
    beschreibung:
      'Nord-Süd-Höhenschnitt (Projektion in X-Richtung) aus dem ' +
      'DG-Planmodell: DG-Außen- und Innenwände, die Dachbodenebene auf der ' +
      'Kehlbalkenlage, die Giebelwände des Dachbodens, die graue 38°-Dachhülle ' +
      'und rot die 2,00-m-Höhenkontrolle. Reine Kontrollzeichnung ohne ' +
      'Maßzahlen und ohne Beschriftung — sie zeigt, wie weit die 2,00-m-Zone ' +
      'unter dem Bestandsdach reicht.',
  },
  {
    datei: 'dachboden-iso.svg',
    quelle: 'qa/Dachboden_V17_Iso.svg',
    titel: 'Axonometrie Dachboden ohne Dach (Modellstand V17)',
    kategorie: 'Schnitte und 3D',
    beschreibung:
      'Schrägbild des Dachbodens mit abgenommenem Dach: orange die nutzbare ' +
      'Bodenfläche auf der Kehlbalkenlage, blaugrau die an der Dachhülle ' +
      'abgeschnittenen Giebelwände, rot der durchlaufende Kamin. Zeigt den ' +
      'Zuschnitt des Dachbodens im Bestand. Ohne Maßzahlen und ohne ' +
      'Beschriftung.',
  },
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // 1. Vollständigkeit prüfen, bevor irgendetwas geschrieben wird.
  const missing = [];
  for (const item of CATALOG) {
    if (!(await exists(resolve(projectDir, item.quelle)))) missing.push(item.quelle);
  }
  if (missing.length) {
    console.error('sync-assets abgebrochen — Quelldatei(en) nicht gefunden:');
    for (const m of missing) console.error(`  ${resolve(projectDir, m)}`);
    console.error(
      '\nEs wurde nichts kopiert und kein index.json geschrieben. ' +
        'Bitte den Katalog in scripts/sync-assets.mjs korrigieren.',
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(outDir, { recursive: true });

  // 2. Kopieren.
  for (const item of CATALOG) {
    await copyFile(resolve(projectDir, item.quelle), resolve(outDir, item.datei));
    console.log(`  kopiert  ${item.quelle}  ->  public/plans/${item.datei}`);
  }

  // 3. Verwaiste SVGs aus früheren Katalogständen entfernen (Idempotenz).
  const wanted = new Set(CATALOG.map((i) => i.datei));
  for (const name of await readdir(outDir)) {
    if (!name.toLowerCase().endsWith('.svg') || wanted.has(name)) continue;
    await rm(resolve(outDir, name));
    console.log(`  entfernt (nicht mehr im Katalog)  public/plans/${name}`);
  }

  // 4. index.json — bewusst ohne Zeitstempel, damit erneute Läufe
  //    bitgleiche Ergebnisse liefern.
  const index = {
    schema: 'hausmodell-plans/1',
    plaene: CATALOG.map((i) => ({
      titel: i.titel,
      kategorie: i.kategorie,
      datei: i.datei,
      quelle: i.quelle,
      beschreibung: i.beschreibung,
    })),
  };
  await writeFile(
    resolve(outDir, 'index.json'),
    JSON.stringify(index, null, 2) + '\n',
    'utf8',
  );

  console.log(
    `\n${CATALOG.length} Pläne und index.json nach public/plans/ übernommen.`,
  );
}

main().catch((err) => {
  console.error('sync-assets fehlgeschlagen:', err);
  process.exitCode = 1;
});
