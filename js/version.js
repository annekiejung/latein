/*
 * Zentrale Versionsnummer der App.
 * Wird sowohl von der Seite (index.html) als auch vom Service Worker (sw.js)
 * geladen. Bei JEDER Änderung an App-Dateien hochzählen – sonst bekommt das
 * iPhone die neue Version nicht, weil der Service Worker die alten Dateien
 * aus dem Cache liefert.
 */
self.APP_VERSION = '0.3.0';
