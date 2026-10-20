#!/usr/bin/env python3
"""Gera os SVGs vetoriais da marca PontoNexo.

A logo original (brand/source/original/) é raster. Este script reconstrói a marca em vetor
com geometria explícita (pino de localização + relógio + órbita com ponto) e o texto
convertido em curvas a partir da Montserrat (OFL), então não depende de fontes instaladas.

Requisitos: fonttools  (pip install -r scripts/brand/requirements.txt)
Uso:        python3 scripts/brand/build_svgs.py
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "brand"
FONTS = BRAND / "source" / "fonts"
SVG = BRAND / "svg"
FAVICON = BRAND / "favicon"

BOLD = TTFont(FONTS / "Montserrat-800.ttf")
MEDIUM = TTFont(FONTS / "Montserrat-500.ttf")

# Cores amostradas da logo original
NAVY = "#001A5A"        # pino
NAVY_TEXT = "#000F4B"   # "Ponto" e tagline
ORANGE_LIGHT = "#FFB000"
ORANGE_DEEP = "#FD8601"
ORANGE = "#FE9A02"      # versão sem degradê
DARK_BG = "#000F4B"
WHITE = "#FFFFFF"
BLACK = "#111111"

TAGLINE = "JORNADA REGISTRADA. GESTÃO SIMPLIFICADA."


# ─────────────────────────── Tipografia → curvas ───────────────────────────

def text_path(font: TTFont, text: str, x: float, baseline: float, size: float, tracking: float = 0) -> tuple[str, float]:
    """Caminho SVG do texto e largura final. `tracking` em fração do corpo."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    scale = size / font["head"].unitsPerEm
    parts: list[str] = []
    cursor = x
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
        parts.append(pen.getCommands())
        cursor += hmtx[name][0] * scale
        if i < len(text) - 1:
            cursor += tracking * size
    return " ".join(p for p in parts if p), cursor - x


def cap_height(font: TTFont, size: float) -> float:
    return font["OS/2"].sCapHeight * size / font["head"].unitsPerEm


# ─────────────────────────── Símbolo ───────────────────────────
# Espaço do símbolo: 0..560 x 0..560. Pino centrado em (260, 238).

CX, CY, R = 262.0, 238.0, 168.0
TIP = (262.0, 528.0)
HOLE = 116.0
# elipse ajustada a três pontos medidos na logo original (ponta esquerda, base, ponta direita)
ORBIT_C = (256.0, 258.0)
ORBIT_RX, ORBIT_RY, ORBIT_ROT = 208.0, 120.0, -18.0
T_START, T_END = 222.0, 2.0   # arco frontal (graus, sentido decrescente passa por baixo)
ORBIT_W = 40.0
GAP = 11.0
DOT_T = -22.0
DOT_R = 28.0


def fmt(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def pin_path() -> str:
    d = math.dist((CX, CY), TIP)
    alpha = math.degrees(math.acos(R / d))
    a1, a2 = math.radians(90 - alpha), math.radians(90 + alpha)
    p1 = (CX + R * math.cos(a1), CY + R * math.sin(a1))
    p2 = (CX + R * math.cos(a2), CY + R * math.sin(a2))
    # ponta levemente arredondada
    k = 0.09
    q1 = (TIP[0] + (p1[0] - TIP[0]) * k, TIP[1] + (p1[1] - TIP[1]) * k)
    q2 = (TIP[0] + (p2[0] - TIP[0]) * k, TIP[1] + (p2[1] - TIP[1]) * k)
    outer = (
        f"M{fmt(p1[0])} {fmt(p1[1])} L{fmt(q1[0])} {fmt(q1[1])} Q{fmt(TIP[0])} {fmt(TIP[1])} {fmt(q2[0])} {fmt(q2[1])} "
        f"L{fmt(p2[0])} {fmt(p2[1])} A{fmt(R)} {fmt(R)} 0 1 1 {fmt(p1[0])} {fmt(p1[1])} Z"
    )
    hole = f"M{fmt(CX + HOLE)} {fmt(CY)} A{fmt(HOLE)} {fmt(HOLE)} 0 1 0 {fmt(CX - HOLE)} {fmt(CY)} A{fmt(HOLE)} {fmt(HOLE)} 0 1 0 {fmt(CX + HOLE)} {fmt(CY)} Z"
    return f"{outer} {hole}"


def ellipse_point(t_deg: float) -> tuple[float, float]:
    t = math.radians(t_deg)
    rot = math.radians(ORBIT_ROT)
    x, y = ORBIT_RX * math.cos(t), ORBIT_RY * math.sin(t)
    return (ORBIT_C[0] + x * math.cos(rot) - y * math.sin(rot), ORBIT_C[1] + x * math.sin(rot) + y * math.cos(rot))


def orbit_path(extra: float = 0.0) -> str:
    """Faixa da órbita com espessura variável (afina nas pontas). `extra` alarga (vão de recorte)."""
    n = 140
    left, right = [], []
    for i in range(n + 1):
        u = i / n
        t = T_START + (T_END - T_START) * u
        p = ellipse_point(t)
        a, b = ellipse_point(t - 0.3), ellipse_point(t + 0.3)
        tx, ty = b[0] - a[0], b[1] - a[1]
        norm = math.hypot(tx, ty)
        nx, ny = -ty / norm, tx / norm
        # mais fina na ponta esquerda (sai de trás do pino), cheia embaixo, afinando à direita
        w = ORBIT_W * (0.18 + 0.82 * math.sin(math.pi * (u ** 0.85)) ** 0.7) / 2 + extra
        left.append((p[0] + nx * w, p[1] + ny * w))
        right.append((p[0] - nx * w, p[1] - ny * w))
    pts = left + right[::-1]
    return "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts) + " Z"


def clock_parts() -> tuple[str, str]:
    """(marcadores laranja, ponteiro) — dentro do mostrador."""
    ticks = []
    for ang in (0, 90, 180, 270):
        a = math.radians(ang - 90)
        cx, cy = CX + 90 * math.cos(a), CY + 90 * math.sin(a)
        horiz = ang in (90, 270)
        w, h = (26, 12) if horiz else (12, 26)
        ticks.append(f'<rect x="{fmt(cx - w / 2)}" y="{fmt(cy - h / 2)}" width="{w}" height="{h}" rx="6"/>')
    a = math.radians(-45)
    x1, y1 = CX + 82 * math.cos(a), CY + 82 * math.sin(a)
    x2, y2 = CX - 66 * math.cos(a), CY - 66 * math.sin(a)
    hand = f'<line x1="{fmt(x2)}" y1="{fmt(y2)}" x2="{fmt(x1)}" y2="{fmt(y1)}" stroke-width="15" stroke-linecap="round"/>'
    return "".join(ticks), hand


@dataclass(frozen=True)
class Palette:
    pin: str
    hand: str
    accent: str          # marcadores, centro, órbita, ponto, "Nexo"
    text: str            # "Ponto"
    tagline: str
    gradient: bool = False


PALETTES = {
    "": Palette(NAVY, NAVY_TEXT, ORANGE, NAVY_TEXT, NAVY_TEXT, gradient=True),
    "-fundo-escuro": Palette(WHITE, WHITE, ORANGE, WHITE, "#C9D2EA", gradient=True),
    "-mono-preto": Palette(BLACK, BLACK, BLACK, BLACK, BLACK),
    "-mono-branco": Palette(WHITE, WHITE, WHITE, WHITE, WHITE),
}


def symbol_group(p: Palette, uid: str, dx: float = 0, dy: float = 0, scale: float = 1.0) -> tuple[str, str]:
    """(defs, grupo) do símbolo desenhado em (dx,dy) com escala."""
    ticks, hand = clock_parts()
    accent = f"url(#og{uid})" if p.gradient else p.accent
    defs = (
        f'<mask id="mk{uid}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="700" height="700">'
        f'<rect x="-50" y="-50" width="700" height="700" fill="#fff"/><path d="{orbit_path(GAP)}" fill="#000"/>'
        f'<circle cx="{fmt(ellipse_point(DOT_T)[0])}" cy="{fmt(ellipse_point(DOT_T)[1])}" r="{DOT_R + GAP}" fill="#000"/></mask>'
    )
    if p.gradient:
        a, b = ellipse_point(T_END), ellipse_point(T_START)
        defs += (
            f'<linearGradient id="og{uid}" gradientUnits="userSpaceOnUse" x1="{fmt(a[0])}" y1="{fmt(a[1] - 60)}" x2="{fmt(b[0])}" y2="{fmt(b[1] + 80)}">'
            f'<stop offset="0" stop-color="{ORANGE_LIGHT}"/><stop offset="1" stop-color="{ORANGE_DEEP}"/></linearGradient>'
        )
    dot = ellipse_point(DOT_T)
    g = (
        f'<g transform="translate({fmt(dx - SYM_X0 * scale)} {fmt(dy)}) scale({fmt(scale)})">'
        f'<g mask="url(#mk{uid})">'
        f'<path d="{pin_path()}" fill="{p.pin}" fill-rule="evenodd"/>'
        f'<g fill="{accent}">{ticks}</g>'
        f'<g stroke="{p.hand}">{hand}</g>'
        f'<circle cx="{fmt(CX)}" cy="{fmt(CY)}" r="17" fill="{accent}"/>'
        f"</g>"
        f'<path d="{orbit_path()}" fill="{accent}"/>'
        f'<circle cx="{fmt(dot[0])}" cy="{fmt(dot[1])}" r="{DOT_R}" fill="{accent}"/>'
        f"</g>"
    )
    return defs, g


# limites do símbolo no próprio espaço
SYM_X0, SYM_Y0, SYM_X1, SYM_Y1 = 36.0, 58.0, 520.0, 532.0


def svg_doc(w: float, h: float, defs: str, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(w)} {fmt(h)}" width="{fmt(w)}" height="{fmt(h)}" role="img" aria-label="{title}">'
        f"<title>{title}</title><defs>{defs}</defs>{body}</svg>\n"
    )


def wordmark(p: Palette, x: float, baseline: float, size: float) -> tuple[str, float]:
    ponto, w1 = text_path(BOLD, "Ponto", x, baseline, size, -0.01)
    nexo, w2 = text_path(BOLD, "Nexo", x + w1 - 0.01 * size, baseline, size, -0.01)
    accent = p.accent if not p.gradient else "url(#tg)"
    return f'<path d="{ponto}" fill="{p.text}"/><path d="{nexo}" fill="{accent}"/>', w1 + w2


def text_gradient(p: Palette, y0: float, y1: float) -> str:
    if not p.gradient:
        return ""
    return f'<linearGradient id="tg" gradientUnits="userSpaceOnUse" x1="0" y1="{fmt(y0)}" x2="0" y2="{fmt(y1)}"><stop offset="0" stop-color="{ORANGE_LIGHT}"/><stop offset="1" stop-color="{ORANGE_DEEP}"/></linearGradient>'


def build() -> None:
    for suffix, p in PALETTES.items():
        # Símbolo
        d, g = symbol_group(p, "s")
        write(SVG / "simbolo" / f"pontonexo-simbolo{suffix}.svg", svg_doc(SYM_X1 - SYM_X0, SYM_Y1 - SYM_Y0, d, f'<g transform="translate(0 {-SYM_Y0})">{g}</g>', "PontoNexo"))

        # Logotipo (texto, sem símbolo)
        size = 200
        cap = cap_height(BOLD, size)
        wm, ww = wordmark(p, 0, cap, size)
        write(SVG / "logotipo" / f"pontonexo-logotipo{suffix}.svg", svg_doc(ww, cap + size * 0.02, text_gradient(p, 0, cap), wm, "PontoNexo"))

        # Empilhado (como a original): símbolo, nome e tagline
        sym_h = SYM_Y1 - SYM_Y0
        size = 230
        cap = cap_height(BOLD, size)
        wm_probe, ww = wordmark(p, 0, 0, size)
        tag_size = 40
        _, tw = text_path(MEDIUM, TAGLINE, 0, 0, tag_size, 0.22)
        width = max(ww, tw, SYM_X1) + 40
        sym_scale = 1.0
        sym_x = (width - (SYM_X1 - SYM_X0) * sym_scale) / 2
        base = sym_h + 60 + cap
        wm, _ = wordmark(p, (width - ww) / 2, base, size)
        tag, _ = text_path(MEDIUM, TAGLINE, (width - tw) / 2, base + 110, tag_size, 0.22)
        d, g = symbol_group(p, "e", sym_x, -SYM_Y0, sym_scale)
        height = base + 110 + 10
        write(
            SVG / "logo-empilhado" / f"pontonexo-logo-empilhado{suffix}.svg",
            svg_doc(width, height, d + text_gradient(p, base - cap, base), g + wm + f'<path d="{tag}" fill="{p.tagline}"/>', "PontoNexo — Jornada registrada. Gestão simplificada."),
        )

        # Horizontal (padrão): símbolo à esquerda, nome e tagline à direita
        sym_scale = 0.62
        sh = sym_h * sym_scale
        size = 150
        cap = cap_height(BOLD, size)
        tag_size = 25.5
        x0 = (SYM_X1 - SYM_X0) * sym_scale + 26
        block_h = cap + 46 + cap_height(MEDIUM, tag_size)
        top = (sh - block_h) / 2 + 6
        base = top + cap
        wm, ww = wordmark(p, x0, base, size)
        # espaçamento menor = letra maior na mesma largura (legível no menu do painel)
        _, tw = text_path(MEDIUM, TAGLINE, 0, 0, tag_size, 0.03)
        tag_size = tag_size * ww / tw  # tagline com a mesma largura do nome
        tag, _ = text_path(MEDIUM, TAGLINE, x0 + 4, base + 46 + cap_height(MEDIUM, tag_size), tag_size, 0.03)
        d, g = symbol_group(p, "h", 0, -SYM_Y0 * sym_scale, sym_scale)
        write(
            SVG / "logo-horizontal" / f"pontonexo-logo-horizontal{suffix}.svg",
            svg_doc(x0 + ww + 8, sh, d + text_gradient(p, base - cap, base), g + wm + f'<path d="{tag}" fill="{p.tagline}"/>', "PontoNexo — Jornada registrada. Gestão simplificada."),
        )

    # Ícone de app: símbolo claro sobre fundo marinho (sangrado), e maskable com zona segura
    for name, frac in (("pontonexo-icone-app", 0.80), ("pontonexo-icone-app-maskable", 0.62)):
        side = 1024
        sw = (SYM_X1 - SYM_X0)
        sc = side * frac / sw
        dx = (side - sw * sc) / 2
        dy = (side - (SYM_Y1 - SYM_Y0) * sc) / 2 - SYM_Y0 * sc + side * 0.02
        d, g = symbol_group(PALETTES["-fundo-escuro"], "a", dx, dy, sc)
        write(SVG / "icone-app" / f"{name}.svg", svg_doc(side, side, d, f'<rect width="{side}" height="{side}" fill="{DARK_BG}"/>' + g, "PontoNexo"))

    # Favicon: versão reforçada (sem marcadores, traços mais grossos) para 16–48 px
    fav = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>PontoNexo</title>'
        f'<rect width="64" height="64" rx="12" fill="{DARK_BG}"/>'
        f'<path d="M32 6c-11.6 0-21 9.2-21 20.6C11 41 32 58 32 58s21-17 21-31.4C53 15.2 43.6 6 32 6zm0 10.5a10.3 10.3 0 1 1 0 20.6 10.3 10.3 0 0 1 0-20.6z" fill="{WHITE}"/>'
        f'<path d="M5 33c4 6.5 15 9.6 27.5 8.2C46 39.8 56 33.6 59 25.5" fill="none" stroke="{ORANGE}" stroke-width="5" stroke-linecap="round"/>'
        f'<circle cx="55.5" cy="15" r="5" fill="{ORANGE}"/></svg>\n'
    )
    write(FAVICON / "icon.svg", fav)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  ✓ {path.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
