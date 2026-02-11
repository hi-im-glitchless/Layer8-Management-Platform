import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  FileCode, 
  FileText, 
  ScrollText, 
  User, 
  Shield,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navigationGroups = [
  {
    label: 'Main',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/template-adapter', icon: FileCode, label: 'Template Adapter' },
      { to: '/executive-report', icon: FileText, label: 'Executive Report' },
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
    items: [
      { to: '/admin', icon: Shield, label: 'Admin Panel' },
    ],
  },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { resolvedTheme } = useTheme()

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
    ? '/layer8_logo_dark.jpg' 
    : '/layer8_logo_white.jpg'

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-center px-4 border-b border-sidebar-border">
        {!collapsed && (
          <img 
            src={logoSrc} 
            alt="Layer8" 
            className="h-8 w-auto object-contain"
          />
        )}
        {collapsed && (
          <div className="text-accent text-xl font-bold">8</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navigationGroups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 && (
              <Separator className="my-2 mx-3" />
            )}
            {!collapsed && (
              <div className="px-3 mb-2">
                <p className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
                  {group.label}
                </p>
              </div>
            )}
            <div className="space-y-1 px-2">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/70',
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
          className="w-full"
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
