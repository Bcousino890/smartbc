// SOLO VERIFICACIÓN LOCAL (PDF del catálogo). Usa PDFKit de macOS, sin
// dependencias: texto por página, enlaces (internos con su página de destino o
// externos con su URL) y, si se pide, cada página en PNG.
//   swift scripts/pdf/inspect.swift <archivo.pdf> [carpeta-png] [ancho-px]
// Salida: JSON por stdout.
import Foundation
import PDFKit
import AppKit

let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("no se puede abrir el PDF\n".data(using: .utf8)!)
  exit(2)
}
let outDir = args.count >= 3 ? args[2] : nil
let width = args.count >= 4 ? Double(args[3]) ?? 900 : 900
if let d = outDir { try? FileManager.default.createDirectory(atPath: d, withIntermediateDirectories: true) }

var pages: [[String: Any]] = []
for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { continue }
  var links: [[String: Any]] = []
  for a in page.annotations {
    var l: [String: Any] = ["subtype": a.type ?? ""]
    if let act = a.action as? PDFActionGoTo, let dp = act.destination.page { l["toPage"] = doc.index(for: dp) + 1 }
    else if let act = a.action as? PDFActionURL { l["url"] = act.url?.absoluteString ?? "" }
    else if let dest = a.destination, let dp = dest.page { l["toPage"] = doc.index(for: dp) + 1 }
    else if let u = a.url { l["url"] = u.absoluteString }
    links.append(l)
  }
  let box = page.bounds(for: .mediaBox)
  pages.append(["n": i + 1, "text": page.string ?? "", "links": links, "w": box.width, "h": box.height])
  if let d = outDir {
    let scale = width / Double(box.width)
    let size = NSSize(width: box.width * scale, height: box.height * scale)
    let img = page.thumbnail(of: size, for: .mediaBox)
    if let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
      try? png.write(to: URL(fileURLWithPath: String(format: "%@/p%03d.png", d, i + 1)))
    }
  }
}
let attrs = doc.documentAttributes ?? [:]
var meta: [String: String] = [:]
for (k, v) in attrs { meta[String(describing: k)] = String(describing: v) }
let out: [String: Any] = ["pageCount": doc.pageCount, "pages": pages, "meta": meta]
let data = try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
