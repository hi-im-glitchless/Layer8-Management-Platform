"""Static Ghostwriter report context data for template rendering tests.

Based on actual GW Report ID 1 data with all fields matching the
TemplateContext format expected by the Jinja2 DOCX templates.
"""

SAMPLE_CONTEXT: dict = {
    "client": {
        "short_name": "AI Template Engine",
    },
    "project": {
        "start_date": "2026-02-13",
        "end_date": "2026-12-11",
    },
    "report_date": "2026-02-13",
    "team": [
        {"name": "admin", "email": "admin@layer8.local"},
    ],
    "findings": [
        {
            "title": "HSTS",
            "severity": "High",
            "severity_color": "FF6600",
            "finding_type": "Cloud",
            "cvss_score": 6.1,
            "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
            "affected_entities": "<p>*.example.com</p>",
            "description": "<p>HTTP Strict Transport Security (HSTS) header is <b>not set</b> on the target application.</p>",
            "impact": "<p>An attacker could <i>intercept</i> unencrypted HTTP traffic and perform man-in-the-middle attacks.</p>",
            "recommendation": "<p>Enable HSTS by setting the <b>Strict-Transport-Security</b> header with a minimum max-age of 31536000.</p>",
            "replication_steps": "<p>1. Navigate to the application.<br>2. Observe the response headers.<br>3. Note the absence of the HSTS header.</p>",
            "references": "<p><a href=\"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security\">MDN HSTS Reference</a></p>",
        },
        {
            "title": "mass form",
            "severity": "Low",
            "severity_color": "28A745",
            "finding_type": "Cloud",
            "cvss_score": 2.2,
            "cvss_vector": "CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:L/I:N/A:N",
            "affected_entities": "<p>POST /api/users</p>",
            "description": "<p>The application is vulnerable to mass assignment via the user registration form.</p>",
            "impact": "<p>Low impact -- attacker could set non-critical user attributes.</p>",
            "recommendation": "<p>Implement <b>allowlisting</b> of acceptable form parameters on the server side.</p>",
            "replication_steps": "<p>1. Submit the form with extra parameters.<br>2. Observe the server accepts them.</p>",
            "references": "",
        },
        {
            "title": "SQLI",
            "severity": "Critical",
            "severity_color": "DC3545",
            "finding_type": "Web",
            "cvss_score": 6.2,
            "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
            "affected_entities": "<p>/search?q=</p>",
            "description": "<p>SQL injection was identified in the search parameter. The application uses <b>unsanitized user input</b> in SQL queries.</p>",
            "impact": "<p>An attacker can <b>read</b>, <b>modify</b>, or <b>delete</b> data in the backend database.</p>",
            "recommendation": "<p>Use <b>parameterized queries</b> or an ORM for all database interactions. Never concatenate user input into SQL.</p>",
            "replication_steps": "<p>1. Navigate to /search<br>2. Enter <i>' OR 1=1 --</i><br>3. Observe the injected query returns all records.</p>",
            "references": "<p><a href=\"https://owasp.org/www-community/attacks/SQL_Injection\">OWASP SQL Injection</a></p>",
        },
        {
            "title": "XSS Reflected",
            "severity": "Medium",
            "severity_color": "FFC107",
            "finding_type": "Web",
            "cvss_score": 5.3,
            "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
            "affected_entities": "<p>/profile?name=</p>",
            "description": "<p>Reflected cross-site scripting (XSS) was found in the <b>name</b> parameter on the profile page.</p>",
            "impact": "<p>An attacker could execute arbitrary JavaScript in the context of an authenticated user's browser session.</p>",
            "recommendation": "<p>Implement <b>output encoding</b> and a strict Content Security Policy (CSP).</p>",
            "replication_steps": "<p>1. Craft URL: /profile?name=&lt;script&gt;alert(1)&lt;/script&gt;<br>2. Send to victim.<br>3. Script executes in victim's browser.</p>",
            "references": "<p><a href=\"https://owasp.org/www-community/attacks/xss/\">OWASP XSS</a></p>",
        },
    ],
    "scope": [
        {"scope": "*.example.com"},
        {"scope": "10.0.0.0/24"},
    ],
    "totals": {
        "findings": 4,
    },
}
