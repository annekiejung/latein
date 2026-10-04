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
| 3 | Grundwortschatz | geplant |
| 4 | Grammatik | geplant |
| 5 | Prüfungsmodus | geplant |
| 6 | Fehlerjournal, Planer, Statistik | geplant |
