# Bestandsmodell-Viewer

Statische Website, die ein aus Bestandsplänen rekonstruiertes Wohnhaus und
eine Umbauvariante im Browser zeigt: 3D-Modell mit Geschoss-Auswahl,
Explosionsansicht, Schnittebenen, Bauteil-Info mit Herkunftsangabe und
Evidenzfärbung, dazu eine Galerie der bemaßten 2D-Pläne.

Technik: Vite + Three.js, Vanilla TypeScript, kein Framework. Das Ergebnis
ist reines HTML/CSS/JS ohne Server-Anteil.

## Starten

    npm install
    npm run dev      # Entwicklungsserver
    npm run build    # statischer Build nach dist/

## Herkunft der Daten

Die Modelldaten unter `public/models/` sind aus FreeCAD-Modellen erzeugt
und liegen hier als fertige JSON bei. Die CAD-Quellen und der Exporter
gehören zu einem nicht öffentlichen Projekt; dieses Repository enthält
ausschließlich den Viewer und seine Anzeigedaten.

## Wichtiger Vorbehalt

CAD-Rekonstruktion aus Bestandsplänen — **kein Aufmaß und kein
Standsicherheitsnachweis.** Der Abschnitt „Grenzen des Modells“ in der
Anwendung benennt die bekannten Lücken: fehlende Treppen, eine in den
Quellmodellen doppelt geführte Geschossdecke, kein Dachtragwerk, kein
Kellergeschoss und Schnitte ohne Kappflächen. Die Umbauvariante ist eine
Studie, keine Ausführungsplanung.
