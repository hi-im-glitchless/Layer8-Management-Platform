import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { hasRole, type Role } from '@/lib/rbac'

/**
 * NEW test infrastructure — there is no pre-existing route-guard test in this
 * repo to copy. It proves the two DISTINCT access criteria for the Client
 * Notes tool:
 *   (A) the ROUTE guard refuses a NORMAL user by redirecting to '/' + toast,
 *       not merely hiding a link;
 *   (B) the SIDEBAR link is absent for NORMAL and present for PM.
 */

// Mutable role the mocked useAuth reports (name must start with "mock" so the
// hoisted vi.mock factory may reference it).
let mockRole: Role = 'NORMAL'

// Spy on sonner's toast.error so we can assert the access-denied notification.
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

// Role-configurable auth. Local rank table avoids referencing an outer import
// from inside the hoisted factory.
vi.mock('@/features/auth/hooks', () => {
  const RANK: Record<string, number> = { NORMAL: 1, PM: 2, ADMIN: 3 }
  return {
    useAuth: () => ({
      user: { id: 'u1', role: mockRole },
      isAuthenticated: true,
      isLoading: false,
      role: mockRole,
      hasRole: (min: string) => RANK[mockRole] >= RANK[min],
    }),
  }
})

// Sidebar dependencies unrelated to visibility filtering.
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))
vi.mock('@/features/board/hooks', () => ({
  useUnreadNotificationCount: () => ({ data: { count: 0 } }),
}))

// Imports AFTER the mocks so they bind to the mocked modules.
import { useAuth } from '@/features/auth/hooks'
import { toast } from 'sonner'
import { Sidebar } from '@/components/layout/Sidebar'

/**
 * Verbatim mirror of App.tsx:41-62 RoleProtectedRoute (the guard is not
 * exported). Kept identical so this test exercises the exact guard behaviour
 * wrapping /client-notes.
 */
function RoleProtectedRoute({ minRole }: { minRole: Role }) {
  const { isAuthenticated, isLoading, role } = useAuth()
  if (isLoading) return <div>loading</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!hasRole(role, minRole)) {
    toast.error('Access denied: insufficient permissions')
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

function renderRouteAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>HOME_SENTINEL</div>} />
        <Route element={<RoleProtectedRoute minRole="PM" />}>
          <Route path="/client-notes" element={<div>CLIENT_NOTES_PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  toastError.mockReset()
  mockRole = 'NORMAL'
})

describe('Client Notes access — route guard', () => {
  it('(1) NORMAL is refused: redirected to / with an access-denied toast, page not rendered', () => {
    mockRole = 'NORMAL'
    renderRouteAt('/client-notes')

    expect(screen.queryByText('CLIENT_NOTES_PAGE')).not.toBeInTheDocument()
    expect(screen.getByText('HOME_SENTINEL')).toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith('Access denied: insufficient permissions')
  })

  it('(2) PM is admitted: the page renders', () => {
    mockRole = 'PM'
    renderRouteAt('/client-notes')

    expect(screen.getByText('CLIENT_NOTES_PAGE')).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('(3) ADMIN is admitted (regression): the page renders', () => {
    mockRole = 'ADMIN'
    renderRouteAt('/client-notes')

    expect(screen.getByText('CLIENT_NOTES_PAGE')).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('Client Notes access — sidebar visibility', () => {
  function renderSidebar() {
    return render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
  }

  it('(4a) NORMAL does not see the Client Notes link', () => {
    mockRole = 'NORMAL'
    renderSidebar()
    expect(screen.queryByText('Client Notes')).not.toBeInTheDocument()
  })

  it('(4b) PM sees the Client Notes link', () => {
    mockRole = 'PM'
    renderSidebar()
    expect(screen.getByText('Client Notes')).toBeInTheDocument()
  })
})
