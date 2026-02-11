import { User as UserIcon, LogOut, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useAuth, useLogout } from '@/features/auth/hooks'

export function Header() {
  const { user, isAdmin } = useAuth();
  const { logout } = useLogout();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
  };

  const handleProfile = () => {
    navigate('/profile');
  };

  // Get user initials for avatar
  const getInitials = () => {
    if (user?.displayName) {
      const words = user.displayName.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return words[0][0].toUpperCase();
    }
    return user?.username?.[0]?.toUpperCase() || 'U';
  };

  const initials = getInitials();

  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-6">
      {/* Left side - could add breadcrumb later */}
      <div className="flex-1" />

      {/* Right side - Theme toggle + User menu */}
      <div className="flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarUrl || undefined} alt={user?.displayName || user?.username || 'User'} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {isAdmin && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
                  <Shield className="h-2.5 w-2.5 text-white" />
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{user?.displayName || user?.username || 'User'}</p>
                  {isAdmin && (
                    <Badge variant="secondary" className="text-xs">
                      Admin
                    </Badge>
                  )}
                </div>
                {user?.displayName && (
                  <p className="text-xs text-muted-foreground">@{user?.username}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {user?.totpEnabled ? 'MFA Enabled' : 'MFA Disabled'}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleProfile}>
              <UserIcon className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
