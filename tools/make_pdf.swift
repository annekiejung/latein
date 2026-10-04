// Erzeugt aus einer HTML-Seite ein A4-PDF – nur mit Bordmitteln von macOS
// (WebKit + PDFKit), keine Zusatzsoftware nötig.
//
// Die Seite muss im PDF-Modus (?pdf) aus Blättern <section class="page">
// von genau 595 × 842 px bestehen (= A4 in Punkten). Jedes Blatt wird zu
// einer PDF-Seite. Läuft Inhalt über ein Blatt hinaus, bricht das Skript ab
// und sagt, welches Blatt zu voll ist (sonst würde Text abgeschnitten).
//
// Aufruf (Testserver muss laufen: perl tools/server.pl):
//   swift tools/make_pdf.swift "http://localhost:8080/docs/workflow_vokabeln.html?pdf" workflow_vokabeln.pdf
import AppKit
import WebKit
import PDFKit

let args = CommandLine.arguments
guard args.count == 3, let url = URL(string: args[1]) else {
  print("Aufruf: swift tools/make_pdf.swift <URL?pdf> <ausgabe.pdf>")
  exit(1)
}
let outURL = URL(fileURLWithPath: args[2])

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)   // kein Dock-Symbol, kein Fenster sichtbar

let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 595, height: 3000))

final class Maker: NSObject, WKNavigationDelegate {
  let output = PDFDocument()

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { waitReady(0) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    print("Laden fehlgeschlagen: \(error.localizedDescription)"); exit(1)
  }

  // Warten, bis die Seite data-ready="1" setzt (max. 10 s)
  func waitReady(_ tries: Int) {
    web.evaluateJavaScript("document.body.dataset.ready === '1'") { result, _ in
      if (result as? Bool) == true { self.measure() }
      else if tries > 100 { print("Seite wurde nicht fertig (data-ready fehlt)."); exit(1) }
      else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { self.waitReady(tries + 1) } }
    }
  }

  // Position jedes Blatts holen und prüfen, ob etwas überläuft
  func measure() {
    let js = """
      JSON.stringify([...document.querySelectorAll('.page')].map((p, i) => {
        const r = p.getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height,
                 over: p.scrollHeight - p.clientHeight, nr: i + 1 };
      }))
      """
    web.evaluateJavaScript(js) { result, error in
      guard let s = result as? String, let data = s.data(using: .utf8),
            let pages = try? JSONSerialization.jsonObject(with: data) as? [[String: Double]], !pages.isEmpty else {
        print("Keine Blätter (.page) gefunden. \(error?.localizedDescription ?? "")"); exit(1)
      }
      let full = pages.filter { ($0["over"] ?? 0) > 1 }
      if !full.isEmpty {
        for p in full { print("Blatt \(Int(p["nr"]!)) ist um \(Int(p["over"]!)) px zu voll.") }
        exit(2)
      }
      // WebView so hoch machen, dass alle Blätter darin liegen
      let bottom = pages.map { $0["y"]! + $0["h"]! }.max()!
      web.frame.size.height = bottom + 20
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.render(pages, 0) }
    }
  }

  // Ein Blatt nach dem anderen als PDF-Seite aufnehmen
  func render(_ pages: [[String: Double]], _ i: Int) {
    if i == pages.count {
      output.write(to: outURL)
      print("PDF gespeichert (\(pages.count) Seiten): \(outURL.path)")
      exit(0)
    }
    let p = pages[i]
    let config = WKPDFConfiguration()
    config.rect = CGRect(x: p["x"]!, y: p["y"]!, width: p["w"]!, height: p["h"]!)
    web.createPDF(configuration: config) { result in
      switch result {
      case .success(let data):
        guard let doc = PDFDocument(data: data), let page = doc.page(at: 0) else {
          print("Seite \(i + 1) konnte nicht erzeugt werden."); exit(1)
        }
        self.output.insert(page, at: self.output.pageCount)
        self.render(pages, i + 1)
      case .failure(let e):
        print("Fehler bei Seite \(i + 1): \(e.localizedDescription)"); exit(1)
      }
    }
  }
}

let maker = Maker()
web.navigationDelegate = maker
web.load(URLRequest(url: url))
app.run()
