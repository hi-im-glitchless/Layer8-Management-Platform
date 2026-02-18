import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateUser } from '@/features/admin/hooks'
import { type Role } from '@/lib/rbac'
import { Copy, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function generatePassword(): string {
  const length = 12
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('NORMAL')
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)

  const createUser = useCreateUser()

  const handleGeneratePassword = () => {
    const newPassword = generatePassword()
    setPassword(newPassword)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate username
    if (username.length < 3 || username.length > 50) {
      toast.error('Username must be 3-50 characters')
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      toast.error('Username must be alphanumeric with underscores only')
      return
    }

    // Validate password
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    try {
      await createUser.mutateAsync({
        username,
        password,
        role,
      })

      // Show created password for copying
      setCreatedPassword(password)
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  const handleClose = () => {
    setUsername('')
    setPassword('')
    setRole('NORMAL')
    setCreatedPassword(null)
    onOpenChange(false)
  }

  const handleCopyPassword = () => {
    if (createdPassword) {
      navigator.clipboard.writeText(createdPassword)
      toast.success('Password copied to clipboard')
    }
  }

  if (createdPassword) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Created Successfully</DialogTitle>
            <DialogDescription>
              Copy this temporary password and share it with the user. They will be
              required to change it on first login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Username</Label>
              <div className="text-sm font-mono mt-1">{username}</div>
            </div>

            <div>
              <Label>Temporary Password</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono">
                  {createdPassword}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPassword}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Create a new user account with a temporary password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                3-50 characters, alphanumeric with underscores
              </p>
            </div>

            <div>
              <Label htmlFor="password">Temporary Password</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGeneratePassword}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                User will be required to change this on first login
              </p>
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="PM">Project Manager</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Determines feature access level
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
