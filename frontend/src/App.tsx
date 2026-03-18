import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { toast, Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { Dashboard } from '@/routes/Dashboard'
import { TemplateAdapter } from '@/routes/TemplateAdapter'
import { ExecutiveReport } from '@/routes/ExecutiveReport'
import { AuditLog } from '@/routes/AuditLog'
import { Admin } from '@/routes/Admin'
import { Profile } from '@/routes/Profile'
import { Schedule } from '@/routes/Schedule'
import { Login } from '@/routes/Login'
import { Documents } from '@/routes/Documents'
import { NotFound } from '@/routes/NotFound'
import { useAuth } from '@/features/auth/hooks'
import { hasRole, type Role } from '@/lib/rbac'

/**
 * Protected route wrapper - redirects to login if not authenticated
 */
function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

/**
 * Role-based route guard - redirects to / if user lacks minimum role
 */
function RoleProtectedRoute({ minRole }: { minRole: Role }) {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(role, minRole)) {
    toast.error('Access denied: insufficient permissions');
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

/**
 * Public route wrapper - redirects to dashboard if already authenticated
 */
function PublicRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes - redirect to dashboard if authenticated */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<Login />} />
            </Route>

            {/* Protected routes - require authentication */}
            <Route element={<ProtectedRoute />}>
              <Route index element={<Dashboard />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/schedule" element={<Schedule />} />

              {/* Manager+ routes */}
              <Route element={<RoleProtectedRoute minRole="MANAGER" />}>
                <Route path="/template-adapter" element={<TemplateAdapter />} />
                <Route path="/executive-report" element={<ExecutiveReport />} />
              </Route>

              {/* Admin-only routes */}
              <Route element={<RoleProtectedRoute minRole="ADMIN" />}>
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Route>

            {/* 404 page */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
