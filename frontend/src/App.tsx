import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { Dashboard } from '@/routes/Dashboard'
import { TemplateAdapter } from '@/routes/TemplateAdapter'
import { ExecutiveReport } from '@/routes/ExecutiveReport'
import { AuditLog } from '@/routes/AuditLog'
import { Admin } from '@/routes/Admin'
import { Profile } from '@/routes/Profile'
import { Login } from '@/routes/Login'
import { NotFound } from '@/routes/NotFound'

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            {/* Login page - outside AppShell */}
            <Route path="/login" element={<Login />} />

            {/* Main app with AppShell */}
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="/template-adapter" element={<TemplateAdapter />} />
              <Route path="/executive-report" element={<ExecutiveReport />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<Admin />} />
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
