# CLAUDE.md – Arbeitsgrundlage für künftige Sitzungen

## Worum geht es?

Latein-Lern-PWA für eine Schülerin (Klasse 10, Gymnasium BW, Latein als
2. Fremdsprache, 5. Lernjahr, Lehrbuch **Pontes** abgeschlossen, Lektüre-Autor
noch offen). Die vollständige Anforderung steht in
`claude-code-prompt-latein-app.md` – **nur lokal**, per `.gitignore` vom
öffentlichen Repo ausgeschlossen (enthält persönliche Angaben). Immer zuerst lesen.

## Verbindliche Arbeitsregeln

- Die Nutzerin ist **keine Programmiererin**: alles in einfachem Deutsch erklären.
- Alles, was installiert, verändert (außerhalb des Projektordners), hochgeladen
  oder veröffentlicht wird (inkl. `git commit`/`git push`), **vorher ankündigen
  und auf Bestätigung warten**.
- Niemals Passwörter/Zugangsdaten eingeben.
- Bei mehreren sinnvollen Wegen: 2–3 Vorschläge mit je einem Satz Vor-/Nachteil.
- Kleine, testbare Schritte; nach jedem Schritt Rückmeldung abwarten.
- Ehrlich über Grenzen; unsichere Daten in der App kennzeichnen.
  Niveau eher fordernd, keine übertriebenen Lob-Meldungen.
- Repo ist **öffentlich**: keine Schulbuchinhalte, keine Fotos, keine
  persönlichen Daten. Lerndaten nur in IndexedDB auf dem Gerät.
- Kein `python3` aufrufen – auf dem Mac ist nur Perl sicher vorhanden
  (python3 löste einen Installationsdialog aus).

## Entscheidungen der Nutzerin

- iPhone (Safari, „Zum Home-Bildschirm“).
- Design: **Altrosa**; App-Symbol Zartrosa (#f6e4e8) mit altrosa Lorbeer, Dateien *-v2.png (Namenswechsel, weil iOS alte Symbole cacht) (Hauptfarbe #8c4a5c, dunkel #e3a3b3; vorher Olivgrün, am 2026-10-04 geändert); Dunkelmodus **nur per Schalter** (Start hell,
  kein automatisches `prefers-color-scheme`).
- Aktuelle Vokabeln: Abfrage **nur Latein → Deutsch** plus Formen-Abfrage
  (Genitiv/Genus, Stammformen). **Kein** Deutsch → Latein.
- Grundwortschatz in Etappen (erst ~500, dann 1000 …, Fernziel 2500).
  Quelle (Entscheidung 2026-10-09, Weg a+c): Etappe 1+2 = Dickinson Latin Core Vocabulary
  (CC BY-SA, Häufigkeit LASLA), Etappe 3 = von Claude zusammengestellt. Alle deutschen
  Bedeutungen von Claude, ALLE mit Wiktionary abgeglichen, Zweifelsfälle mit Georges (1913,
  gemeinfrei); echte Widersprüche der Nutzerin vorlegen (status „vorlage“).
  KEINE Dopplungen: weder in der Liste noch mit Unterrichtsvokabeln (Wort wird dann nur in
  der Lektion gelernt, Grundwortschatz-Lernstand wird beim Import übernommen).
  Dopplung = gleiche Grundform ohne Längen + Wortart + gleiche zweite Form (sameWord in
  vocab.js) → ōs/os, pārēre/parere, iacēre/iacere bleiben getrennt.
- Git über Apple Command Line Tools; Hosting GitHub Pages.
- Erinnerungen: iOS kann offline keine verlässlichen Push-Nachrichten →
  „Heute fällig“ beim Öffnen + Export von Lernterminen als .ics-Kalenderdatei.
- Workflow-PDFs: als HTML-Seite gestalten, Nutzerin speichert sie in Safari
  als PDF (kein PDF-Tool installieren); Inhalte zusätzlich in der App.

## Architektur

```
index.html            App-Shell: Kopfleiste, <main id="view">, Tab-Leiste, <dialog>
manifest.webmanifest  PWA-Manifest (relative Pfade → läuft in Unterordner von Pages)
sw.js                 Service Worker, Cache-first, Cache-Name = 'latein-' + APP_VERSION
reset.html            Reparatur-Seite: entfernt Service Worker + Caches (NICHT IndexedDB); nicht im Cache
css/style.css         Farben als CSS-Variablen; Dunkel unter :root[data-theme="dark"]
js/version.js         APP_VERSION – bei JEDER Änderung hochzählen!
js/app.js             Router (Hash: #/name/param), SW-Registrierung (sw.js?v=VERSION, updateViaCache none), Auto-Update
js/db.js              IndexedDB-Wrapper, Stores, Einstellungen mit Defaults
js/ui.js              h() zum Elementbau (immer Text, nie innerHTML), toast, dialog, applyTheme
js/backup.js          Export (iOS: navigator.share mit Datei) / Import mit Prüfung + Vorschau
js/vocab.js           Vokabel-Importformat: Prüfung (checkEntry/checkImport), Anzeige (headline),
                      Formen-Abfrage (formQuestion), Duplikate (dupKey), Prompt (buildPrompt)
js/vocab-edit.js      Dialog zum Bearbeiten einer Vokabelkarte (Felder je Wortart)
js/leitner.js         Leitner-Fächer, Fälligkeit, Intensivmodus (Testtermin), Tagesprotokoll, Serie
js/check.js           Auswertung getippter Antworten (Bedeutung tolerant, Tippfehler → Nutzerin entscheidet)
js/quiz.js            Abfrage-Runde (Karteikarte/Eingabe), Wiederholung falscher Karten, Zusammenfassung
js/gws.js             Grundwortschatz: Daten laden, Lernstand (coreProgress), Pakete, Abgleich mit
                      Unterrichtsvokabeln (keine Dopplungen), Meldungen/Korrekturen (reports)
data/grundwortschatz.json  GEBAUTE Wortliste (nicht von Hand ändern!) – aus data-src/ mit tools/build_gws.pl
data-src/gws_dcc.txt  Etappe 1+2: Dickinson Core (996 Wörter), deutsche Einträge von Claude
data-src/gws_claude.txt Etappe 3: von Claude zusammengestellt (~1500 Wörter)
data-src/gws_entscheidungen.txt  von Hand geprüfte Abweichungen (nr|gleich/vorlage|Begründung)
data-src/abgleich-*.tsv  Ergebnis des Abgleichs (tools/gws_check.pl)
tools/gws_check.pl    Abgleich der Bedeutungen mit Wiktionary (API) + Georges (zeno.org), Cache in .cache/
tools/build_gws.pl    baut data/grundwortschatz.json, prüft Dopplungen, vergibt Etappen/Pakete
js/grammar.js         Grammatik-Einheiten: Format "latein-grammatik", Prüfung, Prompt, Ergebnisse
js/morph.js           Formenlehre-Daten: Musterverben (ā, ē, ī, kons., gemischt; Akt.+Pass.), unregelmäßige
                      Verben (esse, posse, prōdesse, īre, ferre, velle, nōlle, mālle, fierī), Deklinationen,
                      Adjektive, Pronomen; allForms()/describe() für das Formen-Training
js/views/grammatik-formen.js  Tabellen-Ansichten + Formen-Training (Multiple Choice / selbst bestimmen)
data/grammatik.json   eingebaute Grammatik-Einheiten (von Claude verfasst, Originalsätze geprüft)
tools/verify_quellen.pl  prüft Übersetzungssätze Wort für Wort gegen Latin-Library-Texte (.cache/texte)
tools/find_stellen.pl   sucht Sätze mit Stellenangabe (Buch,Kapitel,Paragraph) in Latin-Library-Texten
js/views/*.js         Je Ansicht: export const title; export async function render(main, params)
icons/                icon.svg (Quelle), PNG 180/192/512 (-v2 = aktuell; die alten Namen ohne -v2 enthalten DASSELBE Bild und dürfen nie gelöscht werden, weil alte Offline-Kopien der Seite darauf zeigen – sonst baut iOS ein Ersatz-Symbol mit „L“) (erzeugt mit qlmanage + sips)
tools/server.pl       Lokaler Testserver (Perl, Port 8080)
tools/make_pdf.swift  HTML → A4-PDF (WebKit + PDFKit, keine Zusatzsoftware)
docs/workflow_*.html  Workflow-Anleitungen (in der App offline + Quelle der PDFs)
workflow_*.pdf        erzeugte PDFs (im Repo, offline gecacht)
```

### Neue Ansicht hinzufügen
1. `js/views/name.js` mit `title` und `render()` anlegen.
2. In `js/app.js` importieren und in `ROUTES` eintragen.
3. In `sw.js` → `APP_FILES` eintragen.
4. `APP_VERSION` erhöhen.

### Neue Datei generell
Immer in `APP_FILES` (sw.js) eintragen, sonst fehlt sie offline.

## Datenformate

### IndexedDB `latein-trainer`, Version 1

| Store | Schlüssel | Inhalt |
|---|---|---|
| settings | key | `{ key, value }` – Defaults in `DEFAULT_SETTINGS` (db.js) |
| vocab | id | aktuelle Vokabeln (Format folgt in Meilenstein 2), Index `lesson` |
| coreProgress | id | Lernstand Grundwortschatz je Wort-ID |
| grammar | id | importierte Grammatik-Einheiten |
| journal | id | Fehlerjournal |
| exams | id | Klassenarbeits-Termine |
| history | id | Lernsitzungen, Prüfungsergebnisse |
| reports | id | gemeldete Fehler in Wortschatz-Daten |

Schema-Änderungen: `DB_VERSION` erhöhen, neuen `if (oldVersion < N)`-Block in
`upgrade()` – alte Blöcke nie ändern.

Einstellungen (Defaults): `theme` 'light', `dailyGoal` 20,
`leitnerIntervals` [1,2,4,8,16], `authorFocus` 'mix', `textbook` 'Pontes',
`grade` 10, `languageOrder` 2, `lastBackupAt` null.

### Backup-Datei (format 1)

```json
{
  "app": "latein-trainer",
  "format": 1,
  "appVersion": "0.1.0",
  "exportedAt": "ISO-Datum",
  "stores": { "settings": [], "vocab": [], "coreProgress": [], "grammar": [],
              "journal": [], "exams": [], "history": [], "reports": [] }
}
```
Import ersetzt **alle** Stores in einer Transaktion (`replaceAll`).
Neueres `format` als bekannt → Import abgelehnt.

### Vokabel-Import "latein-vokabeln" (Version 1)

Kommt aus der Claude-App (Prompt: `buildPrompt()` in js/vocab.js). Beispiel:

```json
{ "format": "latein-vokabeln", "version": 1, "lektion": "Caesar 1",
  "vokabeln": [
    { "latein": "mōs", "wortart": "nomen", "genitiv": "mōris", "genus": "m",
      "bedeutungen": ["Sitte", "Brauch"] },
    { "latein": "mittere", "wortart": "verb", "stammformen": ["mittō", "mīsī", "missum"],
      "bedeutungen": ["schicken"], "hinweis": "…", "unsicher": true } ] }
```

- Verben: `latein` = **Infinitiv** (Wunsch der Nutzerin), Rest in `stammformen`.
- Wortarten: nomen (genitiv, genus m/f/n/m/f), verb (stammformen), adjektiv (formen
  oder genitiv), praeposition (kasus), pronomen/numerale (formen), adverb,
  konjunktion, subjunktion, sonstiges.
- `bedeutungen`: häufigste zuerst. `unsicher: true` = Claude konnte das Foto nicht
  sicher lesen → Badge „bitte prüfen“.
- Fehler (Karte nicht speicherbar): `latein` oder `bedeutungen` fehlen.
  Warnungen: fehlende Formen, unbekannte Felder, unsicher.
- Duplikate: Vergleich ohne Längenzeichen + Wortart (`dupKey`). Vorhandene Karte
  wird bei Auswahl in die neue Lektion verschoben, Lernstand bleibt.
- Gespeichert im Store `vocab` mit zusätzlich `id`, `lektion`, `pos` (Reihenfolge
  wie auf dem Foto), `erstellt`, `geaendert`,
  `lernstand: { fach, faellig: 'YYYY-MM-DD', richtig, falsch, zuletzt }`.
- Zweiter Lernstand `lernstandFormen` (gleiches Format) für die Formen-Abfrage,
  entsteht beim ersten Abfragen.

### Lernen (js/leitner.js, js/check.js, js/quiz.js)

- Leitner: richtig → Fach+1 (max 5), fällig in `leitnerIntervals[fach-1]` Tagen;
  falsch → Fach 1. Nur die ERSTE Antwort pro Runde zählt; falsche Karten werden in
  der Runde bis zu 3× wiederholt (ohne Wirkung aufs Fach).
- „Alle (frei üben)“ ändert keine Fächer, zählt aber fürs Tagesziel.
- Intensivmodus: settings `testTermine` = { Lektion: 'YYYY-MM-DD' }. Intervall ≤
  halbe Resttage (mind. 1); am Vortag und Testtag ist jede Karte fällig, die heute
  noch nicht dran war.
- Store `history`: `{ id: 'tag-YYYY-MM-DD', typ: 'tag', datum, antworten, richtig, sekunden }`.
  Serie = aufeinanderfolgende Tage mit `antworten >= dailyGoal`.
- Store `journal` (Fehlerjournal, Auswertung in Meilenstein 6):
  `{ id, typ: 'vokabel', modus, karteId, lektion, frage, erwartet, gegeben, datum, zeit }`.
- Eine richtige Bedeutung genügt (Wunsch der Nutzerin); die nicht genannten werden
  danach als „Weitere Bedeutungen“ angezeigt (`missingMeanings` in quiz.js).
- Eingabe-Prüfung: Artikel, jdn./etw./sich, Klammern, Groß/klein, Längen egal;
  Tippfehler (Levenshtein ≤1 bzw. ≤2 ab 8 Zeichen; Formen immer ≤1, Genus/Kasus
  exakt) → „Fast – Tippfehler?“, Nutzerin wertet selbst. Autokorrektur im Feld aus.
- settings `quizPrefs`: zuletzt gewählte Abfrage-Einstellungen.

### Grundwortschatz (js/gws.js, js/views/wortschatz.js)

- `data/grundwortschatz.json`: `{ format: 'latein-grundwortschatz', version: 1, stand, quellen,
  lizenz, eintraege: [...] }`. Eintrag = Vokabelfelder (latein, wortart, genitiv, genus,
  stammformen, formen, kasus, bedeutungen, hinweis) + `id` (stabil, aus Grundform MIT
  Längen, z. B. `g-o_s-nom`), `nr`, `etappe` (1: 1–500, 2: 501–996, 3: ab 997), `paket`
  (100er, beginnt an jeder Etappengrenze neu), `quelle` (dcc/claude), `rang` (DCC),
  `pruefung` (wiktionary/georges/geprueft/vorlage/ungeprueft).
- Store `coreProgress`: `{ id, lernstand, lernstandFormen }` – nur der Lernstand.
- Store `reports`: `{ id, eintragId, nr, latein, art, text, korrektur: {bedeutungen}|null,
  vorher, datum, zeit }` – eigene Korrektur gilt sofort (loadCards).
- settings `gwsPakete`: Anzahl freigeschalteter Pakete (Start 1). Empfehlung zum
  Freischalten: ≥ 80 % des letzten Pakets in Fach ≥ 2 (nur Hinweis, Nutzerin entscheidet).
- „sicher“ = Fach ≥ 3. Abfrage nutzt quiz.js mit `save: saveProgress, typ: 'grundwortschatz'`.
- **Wortliste ändern:** data-src/*.txt bearbeiten → `perl tools/gws_check.pl data-src/gws_dcc.txt`
  bzw. `…gws_claude.txt` (dauert, Rate-Limit Wikimedia) → `perl tools/build_gws.pl` → Version
  erhöhen. IDs nicht ändern (Lernstände hängen daran)!

### Grammatik (js/grammar.js, js/views/grammatik.js)

- Format "latein-grammatik" v1: `{ thema, bereich, regel: { kurz, punkte[], beispiel{latein,deutsch} },
  aufgaben: [...] }`; Aufgabentypen: bestimmen (Lösung zeigen + Selbstbewertung richtig/
  teilweise/falsch = 1/½/0), luecke (`___` im Text, `loesung[]` je Lücke, automatische Prüfung
  wie Formen), auswahl (`optionen[]`, `richtig` Index), uebersetzung (`teile[{latein,deutsch}]`,
  `quelle{autor,werk,stelle,status: geprüft|bitte prüfen,link}`, `bearbeitung: original|gekürzt|
  angepasst|konstruiert`, `konstruktion`, `vokabelhilfen[]`; Selbstbewertung pro Teilsatz).
- Eingebaute Einheiten: `data/grammatik.json` → `{ einheiten: [ { id, …Format… } ] }`. Status
  „geprüft“ NUR nach `perl tools/verify_quellen.pl .cache/texte` (Wortlaut im Original gefunden).
  Längenzeichen ergänzt Claude. Importierte Einheiten: Store `grammar`.
- Ergebnisse: Store `history` `{ typ: 'grammatik', einheit, thema, richtig, gesamt, sekunden, zeit }`;
  Fehler: Store `journal` `{ typ: 'grammatik', thema, einheit, phaenomen, frage, erwartet, gegeben,
  bewertung }`.
- Formen-Training: `{ typ: 'formen' }` in history/journal. Mehrdeutige Formen (fuerit = Fut. II
  oder Konj. Perf.) zählen bei jeder passenden Bestimmung (Index über ALLE Verben).
  Konj. Perf. wird mit kurzem i geschrieben (fuerim, fueris) – dadurch gleich wie Fut. II.

## Workflows

- **Lokal testen:** `perl tools/server.pl` → http://localhost:8080.
  Hinweis: Der eingebaute Browser der Claude-App blockiert Service Worker –
  Offline-Test nur auf dem iPhone bzw. in Safari möglich.
- **Updates:** sw.js ruft skipWaiting() auf, Registrierung als `sw.js?v=APP_VERSION`
  → jede neue Version wird sofort übernommen, Seite lädt neu (nicht während
  `window.quizActive`). Hintergrund: Ein iPhone hing in Safari an 0.1.0 fest
  (wartender Service Worker, Hinweis nie angetippt). Notfall: `reset.html`
  (Einstellungen → „App reparieren“).
- **Veröffentlichen:** APP_VERSION erhöhen → Nutzerin fragen → `git add`,
  `git commit`, `git push`. GitHub Pages aktualisiert sich nach ~1 Minute.
  Auf dem iPhone erscheint dann „Neue Version verfügbar“.
- **Workflow-PDF erzeugen:** Anleitung als `docs/workflow_NAME.html` mit Blättern
  `<section class="page">` (im PDF-Modus `?pdf` je 595×842 px = A4). Prompts NICHT
  abschreiben, sondern per Modul-Import aus der App einsetzen (eine Quelle).
  Seite setzt `document.body.dataset.ready = '1'`, wenn fertig. Dann:
  `swift tools/make_pdf.swift "http://localhost:8080/docs/workflow_NAME.html?pdf" workflow_NAME.pdf`
  (Server muss laufen). Bricht ab, wenn ein Blatt überläuft → Text kürzen/kleiner.
  **PDF neu erzeugen, wenn sich der Prompt ändert!** Beide Dateien in `APP_FILES`.
- **Git-Identität:** GitHub-noreply-Adresse verwenden, nie die echte E-Mail.

## Meilensteine

1. Grundgerüst, Offline, Backup – **fertig, auf iPhone getestet**
2. Aktuelle Vokabeln
   - 2a Importformat, Prüfung, Vorschau, Duplikate, Korrektur, Lektionsliste – **fertig (0.2.0)**
   - 2b Abfrage L→D + Formen, Karteikarte/Eingabe, Leitner, Tagesziel, Streak, Intensivmodus – **fertig (0.3.0)**
   - 2c `workflow_vokabeln.pdf` + Anleitung in der App – **fertig (0.3.1)**
   → **Meilenstein 2 abgeschlossen** (Stand 2026-10-04; weiter mit 3 am Folgetag)
3. Grundwortschatz – **gebaut (0.4.0)**: 2507 Wörter, 3 Etappen, 26 Pakete, Abgleich,
   Melden/Korrigieren, keine Dopplungen mit Unterrichtsvokabeln. Offen: Rückmeldung der
   Nutzerin, ggf. Vorlage-Fälle klären.
4. Grammatik – Weg b (Entscheidung 2026-10-09): eingebaute Einheiten + Foto-Import.
   Fertig (0.5.0): Grammatik-Bereich, Import, Einheit „Ablativus absolutus“, Formen-Training
   unregelmäßige Verben (Wunsch der Nutzerin), Konjugations-/Deklinationstabellen.
   Offen: weitere Einheiten (PC, AcI, NcI, nd-Formen, Deponentien, Konj. im HS/GS, Relativsätze,
   Kasusfunktionen), `workflow_grammatik.pdf` + docs/workflow_grammatik.html
5. Prüfungsmodus + `workflow_pruefung.pdf`
6. Fehlerjournal, Klassenarbeits-Planer, Statistik
7. Eigene Vorschläge (Nutzerin wählt)
