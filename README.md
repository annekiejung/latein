# Latein-Trainer

Eine kleine Lern-App für Latein (Gymnasium, Baden-Württemberg): Vokabeln,
Grundwortschatz, Grammatik und Übersetzungstraining.

- Läuft im Browser und nach dem ersten Laden **komplett offline**.
- Installation auf dem iPhone: in Safari öffnen → Teilen → **„Zum Home-Bildschirm“**.
- Alle Lerndaten bleiben **nur auf dem Gerät**. Sicherung über
  *Einstellungen → Backup erstellen* (JSON-Datei).
- Dieses Repository enthält **keine** Schulbuchinhalte und keine persönlichen Daten.

## Technik

Reines HTML, CSS und JavaScript (ES-Module), ohne Framework und ohne Build-Schritt.
Offline-Fähigkeit über einen Service Worker, Daten in IndexedDB.
Gehostet über GitHub Pages.

Lokal testen (auf dem Mac, ohne Zusatzsoftware):

```bash
perl tools/server.pl
```

Dann `http://localhost:8080` öffnen.

## Status

| Meilenstein | Inhalt | Stand |
|---|---|---|
| 1 | Grundgerüst, Offline, Backup | fertig |
| 2 | Aktuelle Vokabeln + Leitner | fertig |
| 3 | Grundwortschatz (2507 Wörter, 96 % abgeglichen) | fertig |
| 4 | Grammatik (10 Einheiten, Formen-Training, Tabellen) | fertig |
| 5 | Prüfungsmodus | geplant |
| 6 | Fehlerjournal, Planer, Statistik | geplant |

## Quellen und Lizenzen

- **Grundwortschatz, Wörter 1–996:** Auswahl, Reihenfolge (Häufigkeit) und Wortart nach
  dem *Latin Core Vocabulary* der [Dickinson College Commentaries](https://dcc.dickinson.edu/latin-core-list1)
  (Christopher Francese; Daten: LASLA), lizenziert unter
  [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/).
- **Deutsche Bedeutungen und Wörter ab 997:** von Claude (KI) erstellt, automatisch
  abgeglichen mit dem [deutschen Wiktionary](https://de.wiktionary.org/) (CC BY-SA) und
  K. E. Georges, *Ausführliches lateinisch-deutsches Handwörterbuch* (1913, gemeinfrei,
  über [zeno.org](http://www.zeno.org/Georges-1913)). Nicht bestätigte Einträge sind in der
  App als „ungeprüft“ markiert.
- Die Wortliste (`data/grundwortschatz.json`, `data-src/`) steht deshalb ebenfalls unter
  **CC BY-SA 4.0**.
