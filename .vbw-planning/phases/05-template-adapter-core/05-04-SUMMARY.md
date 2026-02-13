---
phase: 5
plan: 4
status: complete
---

## Tasks Completed
- Task 1: Feature Module (Types, API, Hooks) -- `71913a1`
- Task 2: Wizard Shell and Step Navigation -- `70aff04`
- Task 3: Steps 1-2 (Upload + Analysis) -- `f6ae5f8`
- Task 4: Steps 3-4 (Adaptation + Preview) -- `de12f0a`
- Task 5: Step 5 (Download) and Final Wiring -- `ee7283a`

## Files Modified
- frontend/src/features/adapter/types.ts (new) -- WizardState, MappingPlan, API response types
- frontend/src/features/adapter/api.ts (new) -- adapterApi with all endpoint methods + SSE streamChat
- frontend/src/features/adapter/hooks.ts (new) -- TanStack Query hooks + useAdapterChat SSE hook
- frontend/src/features/adapter/index.ts (new) -- barrel exports
- frontend/src/features/adapter/components/StepIndicator.tsx (new) -- 5-step progress bar
- frontend/src/features/adapter/components/WizardShell.tsx (new) -- wizard state manager with lazy-loaded steps
- frontend/src/features/adapter/components/StepUpload.tsx (new) -- FileUpload + type/language selects
- frontend/src/features/adapter/components/MappingTable.tsx (new) -- sortable confidence table with tooltips
- frontend/src/features/adapter/components/StepAnalysis.tsx (new) -- auto-analysis + mapping table + chat
- frontend/src/features/adapter/components/AdaptationProgress.tsx (new) -- 4-phase progress indicator
- frontend/src/features/adapter/components/ChatPanel.tsx (new) -- reusable SSE chat with iteration counter
- frontend/src/features/adapter/components/StepAdaptation.tsx (new) -- auto-apply + progress + summary
- frontend/src/features/adapter/components/StepPreview.tsx (new) -- PDF preview + chat panel
- frontend/src/features/adapter/components/StepDownload.tsx (new) -- success card + browser download
- frontend/src/routes/TemplateAdapter.tsx (rewritten) -- WizardShell + error boundary + session URL params

## Deviations
- analyze endpoint uses multipart POST (file + type + language) matching the backend's actual implementation, rather than JSON with sessionId as originally described in plan types -- the backend /api/adapter/analyze accepts file upload, not sessionId
- ChatPanel onMappingUpdate in StepPreview accepts MappingPlan parameter type but uses it only as a signal flag, since the preview step needs to know a mapping changed but doesn't process the plan directly
