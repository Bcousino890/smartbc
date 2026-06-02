#!/usr/bin/env python3
"""Borrado de marca de agua CONSTANTE por perfil.

Uso:  wm_remove.py <perfil> <entrada.jpg> <salida.jpg>

El perfil (/opt/wmrm/profiles/<perfil>.npz) lleva tres mapas estimados a partir
de muchas fotos con la MISMA marca:
  W      = matte aditivo premultiplicado (= alpha * color_marca)
  beta   = 1 - alpha  (atenuacion; estimada por reduccion de varianza)
  smooth = peso de suavizado (alto donde hay marca sobre fondo liso)

Reconstruccion:  J = (I - W) / beta     (recupera el contenido bajo la marca)
y en zonas lisas con marca se mezcla J hacia su version suavizada para borrar el
fantasma residual sin tocar las zonas con textura real.
"""
import sys, os
import numpy as np
from PIL import Image


def boxmean(x, r):
    sq = x.ndim == 2
    if sq:
        x = x[..., None]
    pad = np.pad(x, ((r + 1, r), (r + 1, r), (0, 0)), mode="reflect")
    ii = pad.cumsum(0).cumsum(1)
    h, w = x.shape[:2]
    o = (
        ii[2 * r + 1 : 2 * r + 1 + h, 2 * r + 1 : 2 * r + 1 + w]
        - ii[0:h, 2 * r + 1 : 2 * r + 1 + w]
        - ii[2 * r + 1 : 2 * r + 1 + h, 0:w]
        + ii[0:h, 0:w]
    ) / ((2 * r + 1) ** 2)
    return o[..., 0] if sq else o


def load_profile(name):
    base = os.environ.get("WMRM_PROFILES", "/opt/wmrm/profiles")
    path = os.path.join(base, name + ".npz")
    d = np.load(path)
    return d["W"].astype(np.float64), d["beta"].astype(np.float64), d["smooth"].astype(np.float64)


def main():
    if len(sys.argv) != 4:
        print("uso: wm_remove.py <perfil> <in.jpg> <out.jpg>", file=sys.stderr)
        sys.exit(2)
    profile, inp, outp = sys.argv[1], sys.argv[2], sys.argv[3]

    W, beta, smooth = load_profile(profile)
    ph, pw = W.shape[:2]

    im = Image.open(inp).convert("RGB")
    ow, oh = im.size

    # Trabajamos a la resolucion del perfil; si la imagen no coincide, la
    # llevamos a (pw, ph), procesamos y devolvemos al tamano original.
    work = np.asarray(im.resize((pw, ph)), np.float64)

    J = (work - W) / beta
    Jb = boxmean(J, 8)
    final = (1.0 - smooth) * J + smooth * Jb
    final = np.clip(final, 0, 255).astype(np.uint8)

    out = Image.fromarray(final).resize((ow, oh))
    out.save(outp, quality=92)


if __name__ == "__main__":
    main()
