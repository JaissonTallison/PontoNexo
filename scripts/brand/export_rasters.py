#!/usr/bin/env python3
"""Exporta PNGs, favicon e peças sociais a partir dos SVGs da marca e sincroniza o app web.

Fonte da verdade: brand/svg/ e brand/favicon/icon.svg (gerados por build_svgs.py).
Requisitos: Pillow + ImageMagick 7 (`magick`) com librsvg.
Uso:        python3 scripts/brand/export_rasters.py
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "brand"
SVG = BRAND / "svg"
PNG = BRAND / "png"
FAVICON = BRAND / "favicon"
WEB = ROOT / "apps" / "web"

DARK = (0, 15, 75, 255)      # #000F4B
PAPER = (255, 255, 255, 255)
MODES = ["", "-fundo-escuro", "-mono-preto", "-mono-branco"]
VERSIONS = {"logo-horizontal": [512, 1024, 2048], "logo-empilhado": [512, 1024, 2048], "logotipo": [512, 1024, 2048], "simbolo": [128, 256, 512, 1024]}


def render(svg: Path, width: int, height: int | None = None) -> Image.Image:
    vb_w, vb_h = (float(v) for v in ET.parse(svg).getroot().get("viewBox").split()[2:])
    scale = width / vb_w if height is None else min(width / vb_w, height / vb_h)
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "out.png"
        subprocess.run(
            ["magick", "-background", "none", "-density", f"{96 * scale:.4f}", str(svg), "-resize", f"{round(vb_w * scale)}x{round(vb_h * scale)}!", f"PNG32:{out}"],
            check=True,
        )
        return Image.open(out).convert("RGBA").copy()


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  ✓ {path.relative_to(ROOT)}  ({img.width}x{img.height})")


def on_canvas(logo: Image.Image, w: int, h: int, bg: tuple[int, int, int, int], frac: float) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), bg)
    s = min(w * frac / logo.width, h * frac / logo.height)
    l = logo.resize((round(logo.width * s), round(logo.height * s)), Image.LANCZOS)
    canvas.alpha_composite(l, ((w - l.width) // 2, (h - l.height) // 2))
    return canvas


def main() -> None:
    for version, widths in VERSIONS.items():
        for mode in MODES:
            src = SVG / version / f"pontonexo-{version}{mode}.svg"
            for w in widths:
                save(render(src, w), PNG / version / f"pontonexo-{version}{mode}-{w}.png")

    app = SVG / "icone-app" / "pontonexo-icone-app.svg"
    mask = SVG / "icone-app" / "pontonexo-icone-app-maskable.svg"
    for s in (1024, 512, 192):
        save(render(app, s), PNG / "icone-app" / f"pontonexo-icone-app-{s}.png")
    for s in (512, 192):
        save(render(mask, s), PNG / "icone-app" / f"pontonexo-icone-app-maskable-{s}.png")
    save(render(app, 180), PNG / "icone-app" / "apple-touch-icon-180.png")

    # favicon.ico (16/32/48) a partir da versão reforçada
    fav = render(FAVICON / "icon.svg", 256)
    fav.save(FAVICON / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  ✓ {(FAVICON / 'favicon.ico').relative_to(ROOT)}")

    # Peças sociais
    dark_h = render(SVG / "logo-horizontal" / "pontonexo-logo-horizontal-fundo-escuro.svg", 1600)
    save(on_canvas(dark_h, 1200, 630, DARK, 0.78), PNG / "social" / "pontonexo-open-graph-1200x630.png")
    save(on_canvas(dark_h, 1584, 396, DARK, 0.62), PNG / "social" / "pontonexo-capa-linkedin-1584x396.png")
    save(render(app, 400), PNG / "social" / "pontonexo-avatar-400.png")
    light_h = render(SVG / "logo-horizontal" / "pontonexo-logo-horizontal.svg", 1200)
    save(on_canvas(light_h, 600, 150, PAPER, 0.9), PNG / "email" / "pontonexo-assinatura-email-600.png")

    # Folha de prévia
    tiles = []
    for mode in MODES:
        bg = DARK if mode in ("-fundo-escuro", "-mono-branco") else PAPER
        row = Image.new("RGBA", (2000, 300), bg)
        x = 30
        for version, h in (("logo-horizontal", 150), ("logo-empilhado", 240), ("logotipo", 52), ("simbolo", 190)):
            img = render(SVG / version / f"pontonexo-{version}{mode}.svg", 2000, h)
            row.alpha_composite(img, (x, (300 - img.height) // 2))
            x += img.width + 60
        tiles.append(row)
    sheet = Image.new("RGBA", (2000, 300 * len(tiles) + 40), (232, 236, 242, 255))
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t, (0, i * 300 + i * 10))
    icon = render(app, 220)
    sheet = sheet.crop((0, 0, 2000, sheet.height))
    ImageDraw.Draw(sheet)
    out = Image.new("RGBA", (2000 + 260, sheet.height), (232, 236, 242, 255))
    out.alpha_composite(sheet, (0, 0))
    out.alpha_composite(icon, (2020, 40))
    save(out, BRAND / "preview.png")

    # Sincroniza o app web
    pub = WEB / "public"
    app_dir = WEB / "src" / "app"
    (pub / "brand").mkdir(parents=True, exist_ok=True)
    for version in ("logo-horizontal", "logo-empilhado", "logotipo", "simbolo"):
        for mode in MODES:
            shutil.copy(SVG / version / f"pontonexo-{version}{mode}.svg", pub / "brand")
    shutil.copy(FAVICON / "icon.svg", app_dir / "icon.svg")
    shutil.copy(FAVICON / "icon.svg", pub / "icon.svg")
    shutil.copy(FAVICON / "favicon.ico", app_dir / "favicon.ico")
    shutil.copy(PNG / "icone-app" / "apple-touch-icon-180.png", app_dir / "apple-icon.png")
    shutil.copy(PNG / "social" / "pontonexo-open-graph-1200x630.png", app_dir / "opengraph-image.png")
    shutil.copy(PNG / "icone-app" / "pontonexo-icone-app-192.png", pub / "icon-192.png")
    shutil.copy(PNG / "icone-app" / "pontonexo-icone-app-512.png", pub / "icon-512.png")
    shutil.copy(PNG / "icone-app" / "pontonexo-icone-app-maskable-512.png", pub / "icon-maskable-512.png")
    print("  ✓ apps/web sincronizado")


if __name__ == "__main__":
    main()
