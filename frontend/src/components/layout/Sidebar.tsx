import { useState, useEffect, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileCode,
  FileText,
  FileUp,
  Calendar,
  ScrollText,
  User,
  Shield,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/hooks'
import { type Role } from '@/lib/rbac'

interface NavItem {
  to: string
  icon: typeof LayoutDashboard
  label: string
  minRole?: Role
}

interface NavGroup {
  label: string
  items: NavItem[]
  minRole?: Role
}

const navigationGroups: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Tools',
    items: [
      // Hidden: tools not currently in use
      // { to: '/template-adapter', icon: FileCode, label: 'Template Adapter', minRole: 'PM' },
      // Hidden: tools not currently in use
      // { to: '/executive-report', icon: FileText, label: 'Executive Report', minRole: 'PM' },
      // Hidden: tools not currently in use
      // { to: '/documents', icon: FileUp, label: 'Documents' },
      { to: '/schedule', icon: Calendar, label: 'Schedule' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/audit-log', icon: ScrollText, label: 'Audit Log' },
      { to: '/profile', icon: User, label: 'Profile' },
    ],
  },
  {
    label: 'Admin',
    minRole: 'ADMIN',
    items: [
      { to: '/admin', icon: Shield, label: 'Admin Panel' },
    ],
  },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { resolvedTheme } = useTheme()
  const { user, hasRole: userHasRole } = useAuth()

  const visibleGroups = useMemo(
    () => navigationGroups
      .filter((group) => !group.minRole || userHasRole(group.minRole))
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.minRole || userHasRole(item.minRole)),
      })),
    [user?.role]
  )

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setCollapsed(JSON.parse(saved))
    }
  }, [])

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newState = !collapsed
    setCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newState))
  }

  const logoSrc = resolvedTheme === 'dark'
    ? '/layer8_logo_dark.png'
    : '/layer8_logo_white.jpg'

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center px-4 py-2 border-b border-sidebar-border">
        {!collapsed && (
          <img
            src={logoSrc}
            alt="Layer 8 - Management Platform"
            className="h-8 w-auto object-contain"
          />
        )}
        {collapsed && (
          <div className="text-red-600 text-xl font-bold">8</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3">
        {visibleGroups.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? 'mb-6' : ''}>
            {!collapsed && (
              <div className="px-3 mb-3">
                <p className="text-xs font-medium font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
                  {group.label}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-accent pl-[13px]'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                      collapsed && 'justify-center'
                    )
                  }
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="w-full hover:bg-red-500/20 hover:text-red-500"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>
    </aside>
  )
}
