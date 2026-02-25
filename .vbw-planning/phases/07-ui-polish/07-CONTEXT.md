# Phase 7: UI Polish — Context

## User Vision

Complete the dashboard with real data, fix all hardcoded colors to use the theme system, rebrand the app from "Layer8" to "AI Template Regenerator", clean up dead code, and deliver a polished, consistent user experience across every page.

## Essential Features

### Dashboard Activity Hub
- Welcome message: "Welcome to AI Template Regenerator" (no tagline)
- Recent sessions list: last 5 adapter + report sessions with status and date
- Two quick-action cards: "New Template Adaptation" and "New Executive Report"
- Personalised greeting using user's display name
- Data sourced from existing Redis sessions + DB

### App Rebranding
- All visible text labels: "Layer8" → "AI Template Regenerator"
- Alt text on logos updated to "AI Template Regenerator"
- CSS comments updated
- Logo filenames kept as-is (internal assets, no user-visible impact)
- Locations: Dashboard, Login, Sidebar, OnboardingWizard

### Full Theme Color Audit
- Replace all hardcoded Tailwind colors (bg-green-500, bg-blue-600, etc.) with theme CSS variables
- ~20+ components affected across Profile, Admin, OnboardingWizard, adapter, report features
- Ensures dark/light mode works everywhere
- Key files: Profile.tsx, UserManagement.tsx, LLMSettings.tsx, PasswordChange.tsx, OnboardingWizard.tsx, MappingOverlayCard.tsx, AnalysisProgress.tsx, Header.tsx, Sidebar.tsx, ChatPanel.tsx

### Profile Page Theme Fix
- Replace hardcoded oklch avatar background with theme variable
- Fix bg-green-500 status dot → theme success color
- Fix bg-yellow warning box → theme warning/muted color
- Keep existing layout (no redesign)

### OnboardingWizard Theme Fix
- Fix 7+ instances of hardcoded bg-blue-500, bg-green-100, text-white
- Apply theme system for consistent first impression

### AuditLog Page Header
- Add page title: "Audit Log"
- Add brief description: "View security and compliance audit trail"
- Consistent page layout matching other pages

### Dead Code Cleanup
- Delete App.css (Vite boilerplate, unused)
- Remove unused imports found during color audit
- Clean up any other dead code discovered

## Technical Preferences

- Use existing OKLch theme system (CSS custom properties in index.css)
- Semantic color classes: primary, destructive, accent, muted, secondary
- Dashboard data from existing Redis session APIs + user context
- No new backend endpoints needed for dashboard (reuse existing session listing)

## Boundaries

- No layout redesigns (keep existing page structures)
- No new features beyond dashboard data display
- Logo images not renamed (internal filenames stay)
- No new logo artwork needed (images don't show text "Layer8")
- Profile page: theme fix only, no layout changes

## Acceptance Criteria

1. Dashboard shows real session data (recent adapter + report sessions) and quick-action cards
2. All visible "Layer8" text replaced with "AI Template Regenerator"
3. Zero hardcoded Tailwind color classes in components that have theme equivalents
4. Dark mode and light mode both look correct across all pages
5. App.css deleted, no dead imports
6. AuditLog page has proper header and description
7. OnboardingWizard uses theme colors throughout

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dashboard content | Activity hub (sessions + quick actions) | Gives pentesters immediate context and fast access |
| Color audit scope | Full audit + fix (~20 components) | Ensures theme consistency everywhere |
| Profile page | Theme-aware fix only | Works functionally, just needs color alignment |
| Dead code | Full cleanup | Professional codebase, reduced confusion |
| Dashboard data | Sessions + quick actions | Balanced info vs build effort |
| OnboardingWizard | Include in theme audit | Low marginal effort during full audit |
| AuditLog | Add header + description | Quick win for consistency |
| App name | "AI Template Regenerator" | User-specified rebrand |
| Logo files | Text labels only, keep filenames | No user-visible benefit to renaming |
| Welcome message | Name only, no tagline | Clean and simple |
