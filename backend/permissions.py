from database import User

# Maps department label (stored in allowed_departments) to allocated row key
_DEPT_KEY = {
    'CEO': 'ceo', 'Legal': 'legal', 'HR': 'hr', 'Audit': 'audit',
    'CD&O': 'cdo', 'Corp Ops': 'corpOps', 'Finance': 'finance',
    'Technology': 'technology', 'IO': 'io', 'IRR': 'irr',
    'ISR': 'isr', 'CM&CI': 'cmci', 'PE': 'pe',
}


def filter_for_user(rows: list, user: User) -> list:
    """Return only the rows the user is permitted to see.

    Admins see everything.
    Regular users: empty allow-list on a dimension = no restriction on that dimension.
    """
    if user.is_admin:
        return rows

    allowed_gls   = {g.upper() for g in (user.allowed_gl_codes    or [])}
    allowed_brs   = {b.upper() for b in (user.allowed_branches     or [])}
    allowed_depts = set(user.allowed_departments or [])

    result = []
    for row in rows:
        gl     = str(row.get("glCode",     "")).upper()
        branch = str(row.get("branchCode", "")).upper()

        gl_ok   = gl     in allowed_gls if allowed_gls   else True
        br_ok   = branch in allowed_brs if allowed_brs   else True
        dept_ok = (
            any(row.get(_DEPT_KEY.get(d, ''), 0) > 0 for d in allowed_depts)
            if allowed_depts else True
        )

        if gl_ok and br_ok and dept_ok:
            result.append(row)
    return result
