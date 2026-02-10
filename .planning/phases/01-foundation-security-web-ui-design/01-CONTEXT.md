# Phase 1: Foundation, Security & Web UI Design - Context

**Gathered:** 2026-02-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure infrastructure for user authentication, session isolation, and compliance-grade audit logging — with a fully designed and scaffolded frontend application including auth UI. Admins create user accounts (no self-registration). Desktop-only web application.

</domain>

<decisions>
## Implementation Decisions

### Visual identity & design feel
- Theme selector with dark and light themes, toggle in the header bar (sun/moon icon)
- Default theme follows OS preference (prefers-color-scheme), user can override
- Color palette derived from Layer8 brand logos: black, white, red accent
  - Dark theme uses `layer8_logo_dark.jpg` (white text, red "8" on dark bg)
  - Light theme uses `layer8_logo_white.jpg` (black text, red "8" on light bg)
- Red accent used sparingly — logo, key highlights, destructive actions, important badges. NOT for primary buttons or links. Neutral grays for most UI elements
- Geometric sans-serif typography throughout (e.g., Inter, Geist) — matching the modern, clean logo feel
- Spacious & airy density — generous padding, breathing room between elements
- Rounded & soft component style — rounded corners on cards, buttons, inputs
- Subtle & smooth animations — fade transitions, skeleton loaders, gentle motion
- Toast notifications for feedback (success, error, info) — non-blocking, auto-dismiss (Sonner-style)
- Lucide icons for iconography
- Logo placed at the top of the sidebar navigation
- Design reference: Vercel Dashboard — sleek, dark-first, modern SaaS feel

### Auth experience flow
- No registration page — admins create user accounts
- First login: guided onboarding wizard (set new password → setup TOTP MFA → verify code → welcome screen)
- TOTP "remember me" lasts 30 days on trusted devices
- Generic error messages for all login failures ("Invalid credentials") — prevents username enumeration
- Split-screen login layout: left side has logo over abstract dark gradient/geometric pattern, right side has login form
- Self-service password reset via email link
- Account lockout policy: Claude's discretion

### Application shell & navigation
- Desktop-only web app — no mobile responsiveness needed
- Sidebar navigation with logo at top, collapsible to icon-only mode
- Sidebar structure: Claude's discretion (flat list or grouped sections based on features)
- Minimal header bar: theme toggle + user avatar/dropdown (logout, profile)
- Client-side routing for all planned pages (placeholder/empty states for future features)

### Admin panel
- Admin access is binary: user is either admin or not (simple flag, no role hierarchy)
- Full CRUD for user management: create, edit details, reset passwords, disable/enable, delete users
- Audit log viewer: admins see all user logs, regular users see their own activity history
- Session management: view active sessions (user, IP, last activity) and terminate individual sessions

### Claude's Discretion
- Account lockout policy (rate limiting vs lockout + auto-unlock vs admin-unlock)
- Sidebar navigation grouping strategy
- Loading skeleton and error state design
- Exact font choices within geometric sans-serif family
- Exact spacing values and scale
- Color shade selection for both themes (derived from brand colors)
- Admin panel table/list design and pagination

</decisions>

<specifics>
## Specific Ideas

- Design reference: Vercel Dashboard for overall feel — sleek, modern SaaS dashboard
- Login page: split-screen with left branding panel (logo + dark gradient/geometric pattern) and right form panel
- Brand colors: black, white, red (from Layer8 logos). Red "8" is the signature brand element
- Both logo variants provided: `layer8_logo_dark.jpg` (for dark bg) and `layer8_logo_white.jpg` (for light bg)
- Toast notifications like Sonner — corner-positioned, non-blocking, auto-dismiss
- Onboarding wizard for first-time users: change temp password → scan QR for TOTP → verify code → welcome

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-security-web-ui-design*
*Context gathered: 2026-02-10*
