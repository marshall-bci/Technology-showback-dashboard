"""
Send showback report emails via Microsoft 365 SMTP.
Reads SMTP_USER, SMTP_PASSWORD, SMTP_FROM from environment.
"""
import os
import smtplib
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = "smtp.office365.com"
SMTP_PORT = 587

PERIOD_LABELS = {
    'actuals':   'FY2026 (Actual)',
    'budget':    'FY2026 (Budget)',
    'forecast1': 'FY2027 (Forecast)',
    'forecast2': 'FY2028 (Forecast)',
}


def send_report(to_emails: list[str], dept_label: str, period: str, pdf_bytes: bytes) -> None:
    """
    Send a showback report PDF to the given list of email addresses.
    Raises RuntimeError if SMTP credentials are not configured.
    """
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    if not smtp_user or not smtp_pass:
        raise RuntimeError(
            "SMTP credentials not configured. Set SMTP_USER and SMTP_PASSWORD in .env."
        )

    period_label = PERIOD_LABELS.get(period, period)
    date_str     = datetime.now().strftime("%d %b %Y")
    subject      = f"BCI Technology — {dept_label} Showback Report · {period_label} · {date_str}"
    filename     = f"showback_{dept_label.lower().replace(' ', '_')}_{period}_{datetime.now().strftime('%Y%m%d')}.pdf"

    body = f"""Hi,

Please find attached the BCI Technology Showback Report for the {dept_label} department.

Period: {period_label}
Date:   {date_str}

This report shows your department's allocated technology costs, showback coverage, and
a full line-item breakdown.

If you have questions, contact the BCI Technology team.

—
BCI Technology · Showback Dashboard
"""

    msg = MIMEMultipart()
    msg["From"]    = smtp_from
    msg["To"]      = ", ".join(to_emails)
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    pdf_part = MIMEApplication(pdf_bytes, _subtype="pdf")
    pdf_part.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(pdf_part)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_from, to_emails, msg.as_string())
