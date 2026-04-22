from database import User


def filter_for_user(rows: list, user: User) -> list:
    """Return only the rows the user is permitted to see.

    Admins see everything.
    Regular users see rows where glCode AND branchCode are both in their allow-lists.
    An empty allow-list means no access to that dimension (must be explicitly granted).
    """
    if user.is_admin:
        return rows

    allowed_gls      = {g.upper() for g in (user.allowed_gl_codes  or [])}
    allowed_branches = {b.upper() for b in (user.allowed_branches or [])}

    if not allowed_gls and not allowed_branches:
        return []

    result = []
    for row in rows:
        gl     = str(row.get("glCode",     "")).upper()
        branch = str(row.get("branchCode", "")).upper()
        # If a dimension list is empty it means "no restriction on that dimension"
        # (both must be non-empty for any access at all — enforced above)
        gl_ok     = gl     in allowed_gls      if allowed_gls      else True
        branch_ok = branch in allowed_branches if allowed_branches else True
        if gl_ok and branch_ok:
            result.append(row)
    return result
