"""
Generate a per-department showback PDF matching the dashboard's
"By Showback Type" tab: two summary cards + By Cost Model Category bars.
"""
import io
from datetime import datetime
from collections import defaultdict

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)

# ── Palette (matches dashboard CSS) ──────────────────────────────────────────
NAVY   = colors.HexColor("#00365B")
CYAN   = colors.HexColor("#009DB1")
AMBER  = colors.HexColor("#FF8F00")
SLATE  = colors.HexColor("#515254")
LGREY  = colors.HexColor("#F4F7FA")
MGREY  = colors.HexColor("#E0E0E0")
DGREY  = colors.HexColor("#9E9E9E")
WHITE  = colors.white

DEPT_LABELS = {
    'ceo': 'CEO', 'legal': 'Legal', 'hr': 'HR', 'audit': 'Audit',
    'cdo': 'CD&O', 'corpOps': 'Corp Ops', 'finance': 'Finance',
    'technology': 'Technology', 'io': 'IO', 'irr': 'IRR',
    'pe': 'PE', 'cmci': 'CM&CI', 'isr': 'ISR',
}
PERIOD_LABELS = {
    'actuals':   'FY2026 (Actual)',
    'budget':    'FY2026 (Budget)',
    'forecast1': 'FY2027 (Forecast)',
    'forecast2': 'FY2028 (Forecast)',
}
NEXT_FY = {
    'actuals': 'FY2027', 'budget': 'FY2027',
    'forecast1': 'FY2028', 'forecast2': 'FY2029',
}


def _fmt(v):
    if abs(v) >= 1_000_000:
        return f"${v / 1_000_000:.1f}M"
    if abs(v) >= 1_000:
        return f"${v / 1_000:,.0f}k"
    return f"${v:,.0f}"


def _pct(part, whole):
    if not whole:
        return "—"
    return f"{part / whole * 100:.1f}%"


def _st(r):
    return (r.get('showbackType') or '').lower().strip()


def _is_hc(r):     return 'headcount' in _st(r)
def _is_con(r):    st = _st(r); return 'consumption' in st and 'chargeback' not in st
def _is_con_cb(r): st = _st(r); return 'consumption' in st and 'chargeback' in st


def _is_cb(r):
    st = _st(r)
    cm = (r.get('currentCostModel') or '').lower()
    return st == 'chargeback' or ('chargeback' in cm and 'consumption' not in st and 'headcount' not in st)


def _is_shown_back(r): return _is_hc(r) or _is_con(r) or _is_con_cb(r) or _is_cb(r)


def _p(text, style):
    return Paragraph(str(text), style)


def generate_dept_pdf(rows: list[dict], department: str, period: str) -> bytes:
    dept_label   = DEPT_LABELS.get(department, department.title())
    period_label = PERIOD_LABELS.get(period, period)
    next_fy      = NEXT_FY.get(period, 'FY2027')

    dept_rows   = [r for r in rows if (r.get(department) or 0) > 0]
    total_dept  = sum(r.get(department, 0) for r in dept_rows)
    total_tech  = sum(r.get(period, 0) for r in rows) or 1

    shown_rows  = [r for r in dept_rows if _is_shown_back(r)]
    shown_amt   = sum(r.get(department, 0) for r in shown_rows)
    con_cb_rows = [r for r in dept_rows if _is_con_cb(r)]
    con_cb_amt  = sum(r.get(department, 0) for r in con_cb_rows)

    # ── Styles ─────────────────────────────────────────────────────────────────
    def S(name, **kw):
        return ParagraphStyle(name, **kw)

    title_s  = S('title', fontName='Helvetica-Bold', fontSize=13, textColor=WHITE, leading=17)
    sub_s    = S('sub',   fontName='Helvetica',      fontSize=9,  textColor=colors.HexColor("#90B8CC"), leading=12)
    card_h_s = S('cardh', fontName='Helvetica-Bold', fontSize=11, textColor=NAVY, leading=14)
    card_a_s = S('carda', fontName='Helvetica-Bold', fontSize=26, textColor=NAVY, leading=30)
    card_l_s = S('cardl', fontName='Helvetica',      fontSize=8.5,textColor=SLATE, leading=12)
    badge_s  = S('badge', fontName='Helvetica',      fontSize=8,  textColor=colors.HexColor("#009DB1"), leading=11)
    pct_s    = S('pct',   fontName='Helvetica-Bold', fontSize=9,  textColor=SLATE, leading=12)
    sec_s    = S('sec',   fontName='Helvetica-Bold', fontSize=11, textColor=NAVY,  leading=14, spaceBefore=16, spaceAfter=4)
    sec_sub_s= S('secsub',fontName='Helvetica',      fontSize=8,  textColor=SLATE, leading=11, spaceAfter=10)
    cat_s    = S('cat',   fontName='Helvetica-Bold', fontSize=9,  textColor=NAVY,  leading=12)
    amt_s    = S('amt',   fontName='Helvetica-Bold', fontSize=9,  textColor=SLATE, leading=12)
    leg_s    = S('leg',   fontName='Helvetica',      fontSize=8,  textColor=SLATE, leading=11)
    foot_s   = S('foot',  fontName='Helvetica',      fontSize=7,  textColor=DGREY, leading=10)

    W, H = A4
    margin = 1.8 * cm
    cw = W - 2 * margin   # content width ≈ 457 pt

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin, bottomMargin=margin,
    )
    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    hdr = Table(
        [[_p("Technology Showback Dashboard", title_s),
          _p(f"{dept_label} Department  ·  {period_label}  ·  {datetime.now().strftime('%d %b %Y')}", sub_s)]],
        colWidths=[cw * 0.5, cw * 0.5],
    )
    hdr.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,-1), NAVY),
        ('VALIGN',        (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN',         (1,0), (1, 0),  'RIGHT'),
        ('LEFTPADDING',   (0,0), (-1,-1), 14),
        ('RIGHTPADDING',  (0,0), (-1,-1), 14),
        ('TOPPADDING',    (0,0), (-1,-1), 12),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(hdr)
    story.append(Spacer(1, 14))

    # ── Helper: coloured swatch cell ──────────────────────────────────────────
    def _swatch(col, w=8, h=8):
        t = Table([['']], colWidths=[w], rowHeights=[h])
        t.setStyle(TableStyle([
            ('BACKGROUND',    (0,0),(-1,-1), col),
            ('TOPPADDING',    (0,0),(-1,-1), 0),
            ('BOTTOMPADDING', (0,0),(-1,-1), 0),
            ('LEFTPADDING',   (0,0),(-1,-1), 0),
            ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ]))
        return t

    # ── Helper: progress bar (coloured segments) ──────────────────────────────
    def _bar(segments, max_val, bar_total_w, height=12):
        """segments = [(amount, color), ...] — single Table, no nesting."""
        if not max_val:
            return Spacer(1, height)
        cells, widths, bg = [], [], []
        col_idx = 0
        for amt, col in segments:
            w = bar_total_w * amt / max_val
            if w >= 1:
                cells.append('')
                widths.append(w)
                bg.append(('BACKGROUND', (col_idx, 0), (col_idx, 0), col))
                col_idx += 1
        if not cells:
            return Spacer(1, height)
        bar = Table([cells], colWidths=widths, rowHeights=[height])
        bar.setStyle(TableStyle(bg + [
            ('TOPPADDING',    (0,0),(-1,-1), 0),
            ('BOTTOMPADDING', (0,0),(-1,-1), 0),
            ('LEFTPADDING',   (0,0),(-1,-1), 0),
            ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ]))
        return bar

    # ── Two summary cards ─────────────────────────────────────────────────────
    card_w    = (cw - 10) / 2
    card_pad  = 16                   # _wrap_card left+right padding each side
    inner_w   = card_w - 2 * card_pad   # usable width inside the card
    bar_w_card = inner_w             # bar spans full inner width
    pct_col_w = 60                   # right column for percentage labels
    lbl_col_w = inner_w - pct_col_w  # left column

    # Card 1 — Shown back to business
    shown_pct_of_tech = shown_amt / total_tech * 100 if total_tech else 0
    hc_shown  = sum(r.get(department,0) for r in shown_rows if _is_hc(r))
    con_shown = sum(r.get(department,0) for r in shown_rows if _is_con(r))
    cb_shown  = sum(r.get(department,0) for r in shown_rows if _is_cb(r) or _is_con_cb(r))
    card1_bar = _bar([(hc_shown, NAVY),(con_shown, CYAN),(cb_shown, AMBER)], shown_amt, bar_w_card, 8)

    card1_inner = [
        [_p("Shown back to business", card_h_s),
         _p(f"{shown_pct_of_tech:.1f}%",
            S('pct1', fontName='Helvetica-Bold', fontSize=9, textColor=colors.HexColor("#009DB1"), leading=12, alignment=2))],
        [_p(_fmt(shown_amt),  card_a_s), ''],
        [_p(f"{len(shown_rows)} line items allocated to departments", card_l_s), ''],
        [Spacer(1, 6), ''],
        [card1_bar, ''],
        [Spacer(1, 4), ''],
        [_p("Headcount + Consumption + Chargeback methods", card_l_s),
         _p(_pct(shown_amt, total_dept),
            S('pct1b', fontName='Helvetica-Bold', fontSize=9, textColor=SLATE, leading=12, alignment=2))],
    ]
    c1 = Table(card1_inner, colWidths=[lbl_col_w, pct_col_w])
    c1.setStyle(TableStyle([
        ('SPAN',          (0,1),(1,1)),
        ('SPAN',          (0,2),(1,2)),
        ('SPAN',          (0,3),(1,3)),
        ('SPAN',          (0,4),(1,4)),
        ('SPAN',          (0,5),(1,5)),
        ('TOPPADDING',    (0,0),(-1,-1), 3),
        ('BOTTOMPADDING', (0,0),(-1,-1), 3),
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
    ]))

    # Card 2 — Moving to chargeback
    card2_bar = _bar([(con_cb_amt, AMBER)], con_cb_amt or 1, bar_w_card, 8)
    con_cb_pct = con_cb_amt / total_dept * 100 if total_dept else 0

    card2_inner = [
        [_p("Moving to chargeback", card_h_s),
         _p("Transitioning", badge_s)],
        [_p(_fmt(con_cb_amt), card_a_s), ''],
        [_p(f"{len(con_cb_rows)} items · transitions to direct chargeback", card_l_s), ''],
        [Spacer(1, 6), ''],
        [card2_bar, ''],
        [Spacer(1, 4), ''],
        [_p(f"Consumption showback for 1 year, then chargeback in {next_fy}", card_l_s),
         _p(f"{con_cb_pct:.1f}%",
            S('pct2', fontName='Helvetica-Bold', fontSize=9, textColor=SLATE, leading=12, alignment=2))],
    ]
    c2 = Table(card2_inner, colWidths=[lbl_col_w, pct_col_w])
    c2.setStyle(TableStyle([
        ('SPAN',          (0,1),(1,1)),
        ('SPAN',          (0,2),(1,2)),
        ('SPAN',          (0,3),(1,3)),
        ('SPAN',          (0,4),(1,4)),
        ('SPAN',          (0,5),(1,5)),
        ('TOPPADDING',    (0,0),(-1,-1), 3),
        ('BOTTOMPADDING', (0,0),(-1,-1), 3),
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
    ]))

    def _wrap_card(inner_table, col):
        outer = Table([[inner_table]], colWidths=[card_w])
        outer.setStyle(TableStyle([
            ('BOX',           (0,0),(-1,-1), 1, MGREY),
            ('BACKGROUND',    (0,0),(-1,-1), WHITE),
            ('LEFTPADDING',   (0,0),(-1,-1), 16),
            ('RIGHTPADDING',  (0,0),(-1,-1), 16),
            ('TOPPADDING',    (0,0),(-1,-1), 14),
            ('BOTTOMPADDING', (0,0),(-1,-1), 14),
            ('LINEABOVE',     (0,0),(-1,0),  3, col),
        ]))
        return outer

    cards_row = Table(
        [[_wrap_card(c1, NAVY), '', _wrap_card(c2, AMBER)]],
        colWidths=[card_w, 10, card_w],
        hAlign='LEFT',
    )
    cards_row.setStyle(TableStyle([
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ('TOPPADDING',    (0,0),(-1,-1), 0),
        ('BOTTOMPADDING', (0,0),(-1,-1), 0),
    ]))
    story.append(cards_row)

    # ── By Cost Model Category bars ───────────────────────────────────────────
    story.append(_p("By Cost Model Category", sec_s))
    story.append(_p("Hover a row to focus · shows showback method mix within each category", sec_sub_s))

    # Group by costModelCategory
    cat_data = defaultdict(lambda: {'hc': 0, 'con': 0, 'con_cb': 0, 'other': 0, 'total': 0})
    for r in dept_rows:
        cat = (r.get('costModelCategory') or 'Uncategorised').strip() or 'Uncategorised'
        amt = r.get(department, 0)
        cat_data[cat]['total'] += amt
        if _is_hc(r):     cat_data[cat]['hc']     += amt
        elif _is_con_cb(r): cat_data[cat]['con_cb'] += amt
        elif _is_con(r):  cat_data[cat]['con']    += amt
        else:             cat_data[cat]['other']  += amt

    sorted_cats = sorted(cat_data.items(), key=lambda x: -x[1]['total'])
    max_cat_amt = sorted_cats[0][1]['total'] if sorted_cats else 1

    bar_label_w  = cw * 0.35
    bar_chart_w  = cw * 0.52
    bar_amt_w    = cw * 0.13

    cat_rows = []
    for cat_name, vals in sorted_cats:
        b = _bar(
            [(vals['hc'], NAVY), (vals['con'], CYAN), (vals['con_cb'], AMBER), (vals['other'], DGREY)],
            max_cat_amt, bar_chart_w, height=10,
        )
        cat_rows.append([
            _p(cat_name, cat_s),
            b,
            _p(_fmt(vals['total']), S(f'ca_{cat_name}', fontName='Helvetica-Bold', fontSize=9, textColor=SLATE, leading=12, alignment=2)),
        ])
        cat_rows.append([Spacer(1, 6), '', ''])  # spacing between rows

    if cat_rows:
        cat_table = Table(cat_rows, colWidths=[bar_label_w, bar_chart_w, bar_amt_w])
        cat_table.setStyle(TableStyle([
            ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
            ('TOPPADDING',    (0,0),(-1,-1), 1),
            ('BOTTOMPADDING', (0,0),(-1,-1), 1),
            ('LEFTPADDING',   (0,0),(-1,-1), 0),
            ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ]))
        story.append(cat_table)

    # ── Legend ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    legend_items = [
        (NAVY,  'Showback (Headcount)'),
        (CYAN,  'Showback (Consumption)'),
        (AMBER, 'Showback (Consumption) for 1-year, then Chargeback'),
        (DGREY, 'Other / No Showback'),
    ]
    leg_cells = []
    leg_widths = []
    for col, label in legend_items:
        leg_cells += [_swatch(col, 10, 10), _p(f"  {label}", leg_s)]
        leg_widths += [12, len(label) * 5.2 + 10]

    leg_table = Table([leg_cells], colWidths=leg_widths)
    leg_table.setStyle(TableStyle([
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ('TOPPADDING',    (0,0),(-1,-1), 0),
        ('BOTTOMPADDING', (0,0),(-1,-1), 0),
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 4),
    ]))
    story.append(leg_table)

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MGREY))
    story.append(Spacer(1, 4))
    story.append(_p(
        f"BCI Technology Showback Dashboard  ·  Confidential  ·  {datetime.now().strftime('%d %b %Y %H:%M')}",
        foot_s,
    ))

    doc.build(story)
    return buf.getvalue()
