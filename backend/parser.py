import io
from openpyxl import load_workbook


def parse_management_tab(file_bytes: bytes) -> tuple[list, str]:
    """Parse the F2026 Management Tab sheet from an XLSM/XLSX file.

    Column mapping (1-based Excel columns):
      B=2 Branch, C=3 GL Code, D=4 Branch Code, E=5 PID
      F=6 GL Category, G=7 Cost Model Category, H=8 Description
      I=9 Required, J=10 Current Cost Model, K=11 Allocation
      L=12 Future Cost Model, M=13 Showback Type
      N=14 Actuals, O=15 Forecast1, P=16 Forecast2, Q=17 Budget
      R=18 CEO … AC=29 PE, AD=30 Comments
    Data rows start at row 11.
    """
    wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    sheet_name = next((n for n in wb.sheetnames if n.endswith("Management Tab")), wb.sheetnames[0])
    ws = wb[sheet_name]

    rows = []
    for row in ws.iter_rows(min_row=11, values_only=True):
        if not row or len(row) < 17:
            continue

        def g(col_1):
            idx = col_1 - 1
            return row[idx] if idx < len(row) else None

        def s(col_1):
            v = g(col_1)
            return str(v).strip() if v is not None else ""

        def n(col_1):
            v = g(col_1)
            if v is None:
                return 0.0
            if isinstance(v, (int, float)):
                return float(v)
            try:
                return float(str(v).replace(",", ""))
            except (ValueError, TypeError):
                return 0.0

        actuals, f1, f2, budget = n(14), n(15), n(16), n(17)
        if actuals == 0 and f1 == 0 and f2 == 0 and budget == 0:
            continue
        if not s(2):
            continue

        rows.append({
            "branch":            s(2),
            "glCode":            s(3),
            "branchCode":        s(4),
            "pid":               s(5),
            "glCategory":        s(6),
            "costModelCategory": s(7),
            "description":       s(8),
            "required":          s(9),
            "currentCostModel":  s(10),
            "allocation":        s(11),
            "futureCostModel":   s(12),
            "showbackType":      s(13),
            "actuals":   actuals,
            "forecast1": f1,
            "forecast2": f2,
            "budget":    budget,
            "ceo":        n(18),
            "legal":      n(19),
            "hr":         n(20),
            "audit":      n(21),
            "cdoCorpOps": n(22),
            "finance":    n(23),
            "technology": n(24),
            "io":         n(25),
            "irr":        n(26),
            "isr":        n(27),
            "cmci":       n(28),
            "pe":         n(29),
            "comments":   s(30),
        })

    wb.close()
    return rows, sheet_name
