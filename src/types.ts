/**
 * Datentypen des Export-Formats aus scripts/export_web_meshes.py
 * (Schemas "hausmodell-manifest/1" und "hausmodell-mesh/1").
 *
 * Alle Längen in MILLIMETERN im Projektkoordinatensystem.
 * Z = 0 entspricht EG-FFB = 10,670 m über NN (siehe Manifest.z0_abs_m).
 */

/** Evidenzvokabular des Projekts (siehe AGENTS.md). */
export type EvidenceStatus =
  | 'documented'
  | 'measured'
  | 'derived'
  | 'scan-derived'
  | 'assumed'
  | 'user-marked'
  | 'open'
  | 'tbd';

export type EvidenceConfidence = 'high' | 'medium' | 'low' | string;

export interface Evidence {
  /** Evidenzstufe; `null` bedeutet "nicht gesetzt". */
  status: EvidenceStatus | string | null;
  confidence: EvidenceConfidence | null;
  /** Quellendokument, z. B. "Grundrisse/EG.pdf". */
  source: string | null;
  /** Seite bzw. Planposition. */
  page: string | null;
  /** Freie Zusatzfelder aus dem Generator (z. B. GeometryEvidence). */
  details: Record<string, string>;
}

/** Bauteilkategorie aus dem Objektpräfix. */
export type MeshCategory = 'ARC' | 'STR' | 'OPEN' | 'SPACE' | 'GEN';

export interface MeshEntry {
  /** Technischer Objektname, z. B. "STR_EG_SLAB_180". */
  name: string;
  /** Deutschsprachige Bezeichnung für die UI. */
  label: string;
  category: MeshCategory | string;
  /** Basisfarbe als [r, g, b] mit 0..255. */
  color: [number, number, number];
  /** Flaches Vertex-Array [x0,y0,z0, x1,y1,z1, ...] in Millimetern. */
  positions: number[];
  /** Flaches Dreiecks-Index-Array. */
  indices: number[];
  evidence: Evidence;
}

export interface MeshFile {
  schema: string;
  /** Ebenen-Id, identisch zu LevelInfo.id. */
  level: string;
  meshes: MeshEntry[];
}

export interface LevelInfo {
  id: string;
  /** Dateiname relativ zum Modellverzeichnis. */
  file: string;
  label: string;
  /** Unterkante in mm über EG-FFB. */
  z_base: number;
  /** Oberkante in mm über EG-FFB. */
  z_top: number;
  /** Rang für die Explosionsansicht (gleicher Rang = deckungsgleich). */
  explode_rank: number;
  /** true = gehört zur Umbauvariante, nicht zum Bestand. */
  variant: boolean;
  /** Variantenkennung 2/3/4; null bzw. fehlend = Bestand. */
  variant_id?: string | null;
}

export interface Manifest {
  schema: string;
  units: 'mm' | string;
  /** Absolute Höhe von Z = 0 in Metern über NN. */
  z0_abs_m: number;
  levels: LevelInfo[];
}
