#!/usr/bin/env python3
"""SOLO VERIFICACIÓN LOCAL (PDF del catálogo), sin dependencias.

Lee los objetos de un PDF generado por react-pdf (pdfkit, sin flujos de
objetos): fuentes (y si están incrustadas), URI, el diccionario /Info,
imágenes JPEG incrustadas (DCTDecode, que son archivos JPEG tal cual) y el
texto descomprimido de los flujos, para buscar lo que nunca debe aparecer.

  python3 scripts/pdf/objects.py <archivo.pdf> [carpeta-jpeg]
Salida: JSON por stdout. Con carpeta, escribe cada JPEG como img-<obj>.jpg y
el orden en que las dibuja cada página (página → lista de objetos).
"""
import json, re, sys, zlib, os

data = open(sys.argv[1], "rb").read()
out_dir = sys.argv[2] if len(sys.argv) > 2 else None
objs = {}
for m in re.finditer(rb"(\d+) 0 obj(.*?)endobj", data, re.S):
    objs[int(m.group(1))] = m.group(2)

def dict_of(body):
    i = body.find(b"stream")
    return body[:i] if i >= 0 else body

def stream_of(body):
    m = re.search(rb"stream\r?\n(.*)\r?\nendstream", body, re.S)
    return m.group(1) if m else None

fonts, uris, images, texts = [], [], {}, []
for n, body in objs.items():
    d = dict_of(body)
    if b"/Type /FontDescriptor" in d:
        name = re.search(rb"/FontName /([^\s/>]+)", d)
        fonts.append({"name": name.group(1).decode() if name else "?", "embedded": bool(re.search(rb"/FontFile[23]?\s", d))})
    for u in re.findall(rb"/URI \(([^)]*)\)", d):
        uris.append(u.decode("latin-1"))
    if b"/Subtype /Image" in d and b"/DCTDecode" in d:
        s = stream_of(body)
        images[n] = len(s) if s else 0
        if out_dir and s:
            os.makedirs(out_dir, exist_ok=True)
            open(os.path.join(out_dir, f"img-{n}.jpg"), "wb").write(s)
    s = stream_of(body)
    if s and b"/FlateDecode" in d and b"/Subtype /Image" not in d and b"/FontFile" not in d and b"/Length1" not in d:
        try:
            texts.append(zlib.decompress(s).decode("latin-1"))
        except Exception:
            pass

def pdf_string(v):
    """Cadena literal (...) o hexadecimal <...> de PDF, como texto."""
    v = v.strip()
    if v.startswith(b"<") and not v.startswith(b"<<"):
        raw = bytes.fromhex(v[1:v.index(b">")].decode())
    elif v.startswith(b"("):
        raw = re.sub(rb"\\([()\\])", rb"\1", v[1:v.rindex(b")")])
    else:
        return v.decode("latin-1")
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16")
    return raw.decode("latin-1")

info = {}
m = re.search(rb"/Info (\d+) 0 R", data)
if m and int(m.group(1)) in objs:
    for k, v in re.findall(rb"/(\w+)\s+(\d+ 0 R|\([^)]*\)|<[0-9A-Fa-f]+>)", objs[int(m.group(1))]):
        if v.endswith(b" 0 R"):
            v = objs.get(int(v.split()[0]), b"")
        try:
            info[k.decode()] = pdf_string(v)
        except Exception:
            info[k.decode()] = v.decode("latin-1", "ignore").strip()

# Qué imágenes dibuja cada página, en orden (las páginas referencian las
# imágenes por nombre en /Resources /XObject y las pintan con «/Nombre Do»).
page_images = []
for n, body in sorted(objs.items()):
    d = dict_of(body)
    if re.search(rb"/Type /Page\b", d):
        res = {}
        # /Resources puede ir dentro de la página o como referencia indirecta.
        rr = re.search(rb"/Resources (\d+) 0 R", d)
        rd = dict_of(objs.get(int(rr.group(1)), b"")) if rr else d
        xo = re.search(rb"/XObject\s*<<(.*?)>>", rd, re.S)
        if xo:
            for name, ref in re.findall(rb"/(\w+) (\d+) 0 R", xo.group(1)):
                res[name.decode()] = int(ref)
        order = []
        for c in re.findall(rb"/Contents (\d+) 0 R", d):
            body_c = objs.get(int(c), b"")
            s = stream_of(body_c)
            if s:
                try:
                    txt = zlib.decompress(s).decode("latin-1")
                except Exception:
                    txt = s.decode("latin-1", "ignore")
                for nm in re.findall(r"/(\w+) Do", txt):
                    if nm in res and res[nm] in images:
                        order.append(res[nm])
        page_images.append(order)

print(json.dumps({
    "fonts": fonts, "uris": uris, "info": info,
    "images": len(images), "pageImages": page_images,
    "streamText": "\n".join(texts),
}, ensure_ascii=False))
