"""
Python port of VBA ParseOCToManagementTab allocation logic.
Key reference: VBA_Code.md Phase 6-8 (lines 421-655).

DEPT_KEYS order (output cols R-AC, indices 0-11):
  0=CEO, 1=Legal, 2=HR, 3=Audit, 4=CD&O(+CorpOps),
  5=Finance, 6=Technology, 7=IO, 8=IRR, 9=ISR, 10=CM&CI, 11=PE

User Listing columns F-R (UL indices 0-12):
  0=CEO, 1=Legal, 2=CorpOps, 3=HR, 4=Audit, 5=CD&O,
  6=Finance, 7=Technology, 8=IO, 9=IRR, 10=PE, 11=CM&CI, 12=ISR
"""

DEPT_KEYS = ['CEO', 'Legal', 'HR', 'Audit', 'CD&O', 'Finance',
             'Technology', 'IO', 'IRR', 'ISR', 'CM&CI', 'PE']

OUT_KEYS = ['ceo', 'legal', 'hr', 'audit', 'cdoCorpOps', 'finance',
            'technology', 'io', 'irr', 'isr', 'cmci', 'pe']


# ── OC cell parsing (port of FindAccountDash + FindLastLevelDash) ─────────────

def _find_account_dash(s):
    """Return 0-based index of dash before 5-digit account number, or -1."""
    p = 0
    while p < len(s):
        pos = s.find('-', p)
        if pos == -1 or pos >= len(s) - 8:
            return -1
        nc = s[pos + 1:pos + 6]
        if nc.isdigit() and s[pos + 6:pos + 9] == ' : ':
            return pos
        p = pos + 1
    return -1


def _find_last_level_dash(s):
    """Return 0-based index of last dash before 4-digit level code, or -1."""
    lf = -1
    p = 0
    while p < len(s):
        pos = s.find('-', p)
        if pos == -1 or pos >= len(s) - 4:
            break
        nc = s[pos + 1:pos + 5]
        if nc.isdigit() and (pos + 5 >= len(s) or s[pos + 5] == ' '):
            lf = pos
        p = pos + 1
    return lf


def parse_oc_cell(cell_val: str) -> dict | None:
    """Parse an OC Data Refresh column-A cell string into its components."""
    cell_val = str(cell_val).strip()
    acct_start = _find_account_dash(cell_val)
    if acct_start == -1:
        return None

    product_part = cell_val[:acct_start]
    colon_pos = product_part.find(' : ')
    if colon_pos >= 0:
        prod_id = product_part[:colon_pos].strip()
        prod_name = product_part[colon_pos + 3:].strip()
    else:
        prod_id = ''
        prod_name = product_part.strip()

    remainder = cell_val[acct_start + 1:]
    acct_num = remainder[:5]
    sep = remainder.find(' : ')
    if sep == -1:
        return None
    after_acct = remainder[sep + 3:]

    last_dash = _find_last_level_dash(after_acct)
    if last_dash >= 0:
        acct_name = after_acct[:last_dash].strip()
        level_part = after_acct[last_dash + 1:]
        level_code = level_part[:4]
        level_name = level_part[5:].strip() if len(level_part) > 5 else ''
    else:
        acct_name = after_acct.strip()
        level_code = ''
        level_name = ''

    return {
        'prod_id':    prod_id,
        'prod_name':  prod_name,
        'acct_num':   acct_num,
        'acct_name':  acct_name,
        'level_code': level_code,
        'level_name': level_name,
    }


# ── Index builders ─────────────────────────────────────────────────────────────

def build_cost_model_index(db) -> dict:
    from database import CostModelEntry
    idx = {}
    for e in db.query(CostModelEntry).all():
        key = f"{(e.branch_code or '').strip()}|{(e.gl_code or '').strip()}|{(e.pid or '').strip()}".lower()
        if key not in idx:
            idx[key] = e
    return idx


def build_headcount_index(db, year: str = 'fy2026') -> dict:
    from database import HeadcountEntry
    attr = year if year in ('fy2026', 'fy2027', 'fy2028') else 'fy2026'
    return {e.short_code: getattr(e, attr, 0.0) or 0.0
            for e in db.query(HeadcountEntry).all() if e.short_code}


def build_user_listing_index(db) -> dict:
    from database import UserListingEntry
    idx = {}
    for e in db.query(UserListingEntry).all():
        key = f"{(e.branch_code or '').strip()}|{(e.gl_code or '').strip()}|{(e.pid or '').strip()}".lower()
        if key not in idx:
            # UL order (0-12): CEO, Legal, CorpOps, HR, Audit, CD&O, Finance, Tech, IO, IRR, PE, CM&CI, ISR
            idx[key] = [e.ceo, e.legal, e.corp_ops, e.hr, e.audit,
                        e.cdo, e.finance, e.technology, e.io, e.irr,
                        e.pe, e.cmci, e.isr]
    return idx


# ── Core allocation (port of VBA Phase 7) ────────────────────────────────────

def compute_allocation(row: dict, cm_index: dict, hc_index: dict,
                       ul_index: dict, spread_amount: float) -> dict:
    """
    Populate dept allocation fields on `row` in-place.
    Returns the same dict (mutated).
    """
    pid        = (row.get('pid') or '').strip()
    level_code = (row.get('branchCode') or '').strip()
    acct_num   = (row.get('glCode') or '').strip()
    lookup_key = f"{level_code}|{acct_num}|{pid}".lower()

    comments   = ''
    zero_alloc = {k: 0.0 for k in OUT_KEYS}

    cm = cm_index.get(lookup_key)

    # ── Validate PID + CM lookup ──────────────────────────────────────────────
    if not pid:
        row.update(zero_alloc)
        row['comments'] = 'Check the description and reason for no PD code. '
        return row

    if not cm:
        row.update(zero_alloc)
        row['comments'] = 'PID not found in previous Cost Model. Please check if these are technology specific costs. '
        return row

    # Populate metadata from CM
    row['description']       = (cm.description or row.get('description', '')).strip()
    row['required']          = (cm.required or '').strip()
    row['currentCostModel']  = (cm.current_cost_model or '').strip()
    row['allocation']        = (cm.allocation or '').strip()
    row['futureCostModel']   = (cm.future_cost_model or '').strip()
    row['showbackType']      = (cm.showback_type or '').strip()
    row['costModelCategory'] = (cm.cost_model_category or '').strip()
    user_list_val = (cm.user_listing_flag or '').strip().lower()

    # ── Missing fields check ──────────────────────────────────────────────────
    missing_cols = []
    if not row['required']:
        missing_cols.append('Required or Requested')
    if not row['currentCostModel']:
        missing_cols.append('Current Cost Model')
    if not row['futureCostModel']:
        missing_cols.append('Potential Future Cost Model')
    if not row['showbackType']:
        missing_cols.append('Showback Type')
    if missing_cols:
        comments = f"Missing in Cost Model: {', '.join(missing_cols)}. Please populate the master data. "

    current_cm   = row['currentCostModel']
    cm_lower     = current_cm.lower()
    is_direct    = 'direct allocation to' in cm_lower
    is_chargeback = 'chargeback' in cm_lower
    use_user_list = user_list_val == 'cost allocated based on user listing'

    if not is_direct and not is_chargeback:
        if not current_cm:
            comments += "Current Cost Model doesn't have data. "
        row.update(zero_alloc)
        row['comments'] = comments
        return row

    # ── Step 1: Identify absorber ─────────────────────────────────────────────
    if is_direct:
        absorber = current_cm[cm_lower.find('direct allocation to') + 20:].strip()
    else:
        absorber = 'Technology'

    # ── Step 2: Multi-absorber check ──────────────────────────────────────────
    if is_direct and ',' in absorber:
        row.update(zero_alloc)
        row['comments'] = comments + 'Check the allocation, how two departments can have a direct allocation for the same product. '
        return row

    # ── Step 3: Map absorber to dept index ────────────────────────────────────
    abs_idx = -1
    absorber_lower = absorber.lower()
    for i, dk in enumerate(DEPT_KEYS):
        if dk.lower() in absorber_lower:
            abs_idx = i
            break
    if 'corp ops' in absorber_lower:
        abs_idx = 4  # CD&O slot

    # ── Step 4: Participants from allocation column ───────────────────────────
    alloc_val = row['allocation']
    k_is_all  = alloc_val.lower() == 'all' or alloc_val == ''
    participants = [True] * 12 if k_is_all else [False] * 12

    if not k_is_all:
        parts = [p.strip() for p in alloc_val.split(',')]
        for pt in parts:
            pt_lower = pt.lower()
            for i, dk in enumerate(DEPT_KEYS):
                if pt_lower == dk.lower():
                    participants[i] = True
                    break
            if pt_lower == 'corp ops':
                participants[4] = True

    if alloc_val == '' and is_direct:
        comments += 'Column K (Allocation) is empty. Delete and rerun after updating Column J in Cost Model. Ignore if correct. '

    abs_in_list = abs_idx >= 0 and participants[abs_idx]

    # ── Step 6: Department counts ─────────────────────────────────────────────
    hc_cdo     = hc_index.get('CD&O', 0.0)
    hc_corp_ops = hc_index.get('Corp Ops', 0.0)
    dept_count  = [0.0] * 12
    ul_ok       = False
    ul_data     = None

    if use_user_list:
        ul_data = ul_index.get(lookup_key)
        if ul_data:
            # Map UL (0-12) → output (0-11)
            dept_count[0]  = ul_data[0]              # CEO
            dept_count[1]  = ul_data[1]              # Legal
            dept_count[2]  = ul_data[3]              # HR
            dept_count[3]  = ul_data[4]              # Audit
            dept_count[4]  = ul_data[5] + ul_data[2] # CD&O + CorpOps
            dept_count[5]  = ul_data[6]              # Finance
            dept_count[6]  = ul_data[7]              # Technology
            dept_count[7]  = ul_data[8]              # IO
            dept_count[8]  = ul_data[9]              # IRR
            dept_count[9]  = ul_data[12]             # ISR
            dept_count[10] = ul_data[11]             # CM&CI
            dept_count[11] = ul_data[10]             # PE

            if all(c == 0 for c in dept_count):
                suffix = ('Chargeback - ' if is_chargeback else '')
                comments += (f"{suffix}User Based Listing has no user counts for this product. "
                             "Please add user count in the User Based Listing sheet and rerun, "
                             "or remove 'Cost allocated based on user listing' from Cost Model column M and rerun. ")
                row.update(zero_alloc)
                row['comments'] = comments
                return row
            ul_ok = True
        else:
            suffix = ('Chargeback - ' if is_chargeback else '')
            comments += (f"{suffix}User Based Listing not found for this product. "
                         "Please add user count in the User Based Listing sheet and rerun. ")
            row.update(zero_alloc)
            row['comments'] = comments
            return row
    else:
        for i, dk in enumerate(DEPT_KEYS):
            if i == 4:
                dept_count[i] = hc_cdo + hc_corp_ops
            else:
                dept_count[i] = hc_index.get(dk, 0.0)

    # ── Step 6b: CD&O / Corp Ops split when not "all" ────────────────────────
    part_comment = ''
    if participants[4] and not k_is_all:
        parts_lower = [p.strip().lower() for p in alloc_val.split(',')]
        has_cdo = 'cd&o' in parts_lower
        has_co  = 'corp ops' in parts_lower
        if has_cdo and not has_co:
            dept_count[4] = ul_data[5] if (use_user_list and ul_ok and ul_data) else hc_cdo
            part_comment = 'Only CD&O allocated (not Corp Ops). '
        elif has_co and not has_cdo:
            dept_count[4] = ul_data[2] if (use_user_list and ul_ok and ul_data) else hc_corp_ops
            part_comment = 'Only Corp Ops allocated (not CD&O). '

    # ── Step 7: Calculate allocations ────────────────────────────────────────
    alloc       = [0.0] * 12
    total_denom = 0.0
    sum_alloc   = 0.0

    for i in range(12):
        if participants[i]:
            if abs_in_list:
                total_denom += dept_count[i]
            elif i != abs_idx:
                total_denom += dept_count[i]

    if total_denom > 0 and spread_amount != 0:
        for i in range(12):
            if participants[i] and i != abs_idx:
                alloc[i] = (dept_count[i] / total_denom) * spread_amount
                sum_alloc += alloc[i]
        if abs_idx >= 0 and abs_in_list:
            alloc[abs_idx] = spread_amount - sum_alloc

    if part_comment:
        comments += part_comment
    if is_chargeback:
        comments += 'Check chargebacks, if correct. '

    for i, k in enumerate(OUT_KEYS):
        row[k] = alloc[i]

    row['comments'] = comments
    return row


# ── Full pipeline ─────────────────────────────────────────────────────────────

def run_allocation(db, period: str = 'actuals', hc_year: str = 'fy2026') -> list[dict]:
    """
    Read OcRawRow + reference tables from DB, run allocation, return rows.
    period: 'actuals' | 'forecast1' | 'forecast2' | 'budget'
    hc_year: 'fy2026' | 'fy2027' | 'fy2028'
    """
    from database import OcRawRow

    cm_index = build_cost_model_index(db)
    hc_index = build_headcount_index(db, year=hc_year)
    ul_index = build_user_listing_index(db)

    results = []
    for raw in db.query(OcRawRow).all():
        parsed = parse_oc_cell(raw.oc_cell)
        if not parsed:
            continue

        spread = {
            'actuals':   raw.actuals,
            'forecast1': raw.forecast1,
            'forecast2': raw.forecast2,
            'budget':    raw.budget,
        }.get(period, raw.actuals)

        row = {
            'branch':            parsed['level_name'],
            'glCode':            parsed['acct_num'],
            'branchCode':        parsed['level_code'],
            'pid':               parsed['prod_id'],
            'glCategory':        parsed['acct_name'],
            'costModelCategory': '',
            'description':       parsed['prod_name'],
            'required':          '',
            'currentCostModel':  '',
            'allocation':        '',
            'futureCostModel':   '',
            'showbackType':      '',
            'actuals':   raw.actuals,
            'forecast1': raw.forecast1,
            'forecast2': raw.forecast2,
            'budget':    raw.budget,
            **{k: 0.0 for k in OUT_KEYS},
            'comments': '',
        }

        compute_allocation(row, cm_index, hc_index, ul_index, spread)
        results.append(row)

    return results
