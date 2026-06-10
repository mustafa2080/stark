import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable
import os, sys


# ── Font: find a system Arabic font ──────────────────────────────────────────
FONT_PATHS = [
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\tahoma.ttf",
    r"C:\Windows\Fonts\tahomabd.ttf",
    r"C:\Windows\Fonts\times.ttf",
]
arabic_font   = None
arabic_bold   = None

for p in FONT_PATHS:
    if os.path.exists(p):
        name = os.path.splitext(os.path.basename(p))[0]
        try:
            pdfmetrics.registerFont(TTFont(name, p))
            if arabic_font is None:
                arabic_font = name
            elif arabic_bold is None:
                arabic_bold = name
                break
        except Exception:
            pass

if arabic_font is None:
    sys.exit("ERROR: No Arabic font found in C:\\Windows\\Fonts")
if arabic_bold is None:
    arabic_bold = arabic_font

print(f"Using fonts: normal={arabic_font}, bold={arabic_bold}")


# ── Arabic helper ─────────────────────────────────────────────────────────────
def ar(text):
    """Reshape + BiDi so Arabic renders correctly in ReportLab."""
    reshaped = arabic_reshaper.reshape(text)
    return get_display(reshaped)

def mix(ar_text, en_text=""):
    """Arabic phrase optionally followed by English."""
    if en_text:
        return ar(ar_text) + "  " + en_text
    return ar(ar_text)

# ── Colors ────────────────────────────────────────────────────────────────────
BLACK    = colors.HexColor("#0a0a0a")
DARK     = colors.HexColor("#1a1a1a")
GOLD     = colors.HexColor("#c8a96e")
LIGHT_BG = colors.HexColor("#f5f5f5")
BORDER   = colors.HexColor("#cccccc")
WHITE    = colors.white
GRAY     = colors.HexColor("#555555")

W, H = A4

# ── Styles ────────────────────────────────────────────────────────────────────
def S(name, font=None, size=10, leading=16, color=DARK, align=TA_RIGHT, **kw):
    return ParagraphStyle(name,
        fontName=font or arabic_font,
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=align,
        **kw
    )

heading_c = S("hc", font=arabic_bold, size=22, leading=28, color=WHITE, align=TA_CENTER)
sub_c     = S("sc", size=10, leading=14, color=colors.HexColor("#aaaaaa"), align=TA_CENTER)
title_c   = S("tc", font=arabic_bold, size=16, leading=22, color=BLACK, align=TA_CENTER)
sub2_c    = S("s2", size=9,  leading=13, color=GRAY, align=TA_CENTER)
body      = S("bd", size=9.5, leading=16, color=DARK, spaceAfter=3)
body_b    = S("bdb", font=arabic_bold, size=9.5, leading=16, color=BLACK, spaceAfter=3)
art_head  = S("ah", font=arabic_bold, size=10.5, leading=17, color=BLACK, spaceBefore=8, spaceAfter=4)
small_c   = S("sm", size=7.5, leading=12, color=colors.HexColor("#888888"), align=TA_CENTER)
label_r   = S("lr", font=arabic_bold, size=9, leading=14, color=GRAY)
cell_r    = S("cr", size=9, leading=14, color=DARK)


# ── Custom Flowables ──────────────────────────────────────────────────────────
class HeaderBanner(Flowable):
    def __init__(self, w, h=120):
        Flowable.__init__(self)
        self.width, self.height = w, h

    def draw(self):
        c = self.canv
        # Background
        c.setFillColor(BLACK)
        c.rect(0, 0, self.width, self.height, fill=1, stroke=0)
        # Gold top strip
        c.setFillColor(GOLD)
        c.rect(0, self.height-4, self.width, 4, fill=1, stroke=0)
        # Gold bottom strip
        c.rect(0, 0, self.width, 3, fill=1, stroke=0)
        # Circle logo
        cx, cy = self.width/2, self.height/2 + 12
        c.setFillColor(colors.HexColor("#1a1a1a"))
        c.circle(cx, cy, 28, fill=1, stroke=0)
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.5)
        c.circle(cx, cy, 28, fill=0, stroke=1)
        # S letter
        c.setFillColor(GOLD)
        c.setFont(arabic_bold, 18)
        c.drawCentredString(cx, cy - 7, "S")
        # STARK text
        c.setFillColor(WHITE)
        c.setFont(arabic_bold, 22)
        c.drawCentredString(self.width/2, 36, "STARK LOGISTICS")
        # sub
        c.setFillColor(colors.HexColor("#999999"))
        c.setFont(arabic_font, 9)
        c.drawCentredString(self.width/2, 20, ar("شركة STARK للشحن والخدمات اللوجستية  |  Est. 2001  |  Cairo, Egypt"))


class SectionBar(Flowable):
    def __init__(self, w, label_ar, label_en=""):
        Flowable.__init__(self)
        self.width, self.height = w, 26
        self.label_ar = label_ar
        self.label_en = label_en

    def draw(self):
        c = self.canv
        c.setFillColor(BLACK)
        c.roundRect(0, 2, self.width, 22, 4, fill=1, stroke=0)
        c.setFillColor(GOLD)
        c.roundRect(0, 2, 5, 22, 2, fill=1, stroke=0)
        # text right-aligned
        label = ar(self.label_ar)
        if self.label_en:
            label = label + "  /  " + self.label_en
        c.setFillColor(WHITE)
        c.setFont(arabic_bold, 9.5)
        c.drawRightString(self.width - 12, 9, label)


class SignBlock(Flowable):
    def __init__(self, w):
        Flowable.__init__(self)
        self.width, self.height = w, 88

    def draw(self):
        c = self.canv
        half = (self.width - 12) / 2
        for i, title in enumerate([ar("الطرف الثاني — العميل"), ar("الطرف الأول — شركة STARK")]):
            x = i * (half + 12)
            c.setFillColor(LIGHT_BG)
            c.roundRect(x, 0, half, 82, 4, fill=1, stroke=0)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.5)
            c.roundRect(x, 0, half, 82, 4, fill=0, stroke=1)
            # gold header
            c.setFillColor(BLACK)
            c.roundRect(x, 72, half, 10, 3, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont(arabic_bold, 7)
            c.drawCentredString(x + half/2, 74, title)
            # name line
            c.setFillColor(GRAY)
            c.setFont(arabic_font, 8)
            c.drawRightString(x + half - 10, 58, ar("الاسم: _________________________"))
            # signature line
            c.setStrokeColor(BORDER)
            c.line(x+12, 32, x+half-12, 32)
            c.setFillColor(GRAY)
            c.setFont(arabic_font, 7.5)
            c.drawCentredString(x + half/2, 23, ar("التوقيع والختم"))
            c.drawCentredString(x + half/2, 12, ar("التاريخ: _____ / _____ / _______"))

