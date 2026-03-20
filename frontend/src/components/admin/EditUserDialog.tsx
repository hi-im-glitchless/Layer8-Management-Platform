import { useState, useEffect } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { useUpdateUser, useResetPassword, useResetTOTP } from '@/features/admin/hooks'
import type { AdminUser } from '@/features/admin/types'
import { type Role } from '@/lib/rbac'
import { Sparkles, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface EditUserDialogProps {
  user: AdminUser | null
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

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('NORMAL')
  const [newPassword, setNewPassword] = useState('')

  const updateUser = useUpdateUser()
  const resetPassword = useResetPassword()
  const resetTOTP = useResetTOTP()

  useEffect(() => {
    if (user) {
      setUsername(user.username)
      setDisplayName(user.displayName ?? '')
      setRole(user.role as Role)
      setNewPassword('')
    }
  }, [user])

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) return

    // Validate username
    if (username.length < 3 || username.length > 50) {
      toast.error('Username must be 3-50 characters')
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      toast.error('Username must be alphanumeric with underscores only')
      return
    }

    try {
      const trimmedDisplayName = displayName.trim()
      await updateUser.mutateAsync({
        id: user.id,
        data: {
          username: username !== user.username ? username : undefined,
          displayName: trimmedDisplayName !== (user.displayName ?? '') ? trimmedDisplayName : undefined,
          role: role !== (user.role as Role) ? role : undefined,
        },
      })
      onOpenChange(false)
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  const handleResetPassword = async () => {
    if (!user || !newPassword) return

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    try {
      await resetPassword.mutateAsync({
        id: user.id,
        password: newPassword,
      })
      setNewPassword('')
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  const handleResetMFA = async () => {
    if (!user) return

    if (
      !confirm(
        'Are you sure you want to reset MFA for this user? They will need to set it up again.'
      )
    ) {
      return
    }

    try {
      await resetTOTP.mutateAsync(user.id)
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  const handleGeneratePassword = () => {
    setNewPassword(generatePassword())
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user details, reset password, or reset MFA.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpdateUser}>
          <div className="space-y-6">
            {/* User Details */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit-displayName">Display Name</Label>
                <Input
                  id="edit-displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Jose Abreu"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Full name shown in the UI (max 50 characters)
                </p>
              </div>

              <div>
                <Label htmlFor="edit-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="PM">Project Manager</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Determines feature access level
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={updateUser.isPending}
              >
                {updateUser.isPending ? 'Updating...' : 'Update User'}
              </Button>
            </div>

            <Separator />

            {/* Reset Password */}
            <div className="space-y-4">
              <div>
                <Label className="text-base">Reset Password</Label>
                <p className="text-xs text-muted-foreground">
                  Set a new temporary password for this user
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New temporary password"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGeneratePassword}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleResetPassword}
                disabled={!newPassword || resetPassword.isPending}
              >
                {resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </div>

            <Separator />

            {/* Reset MFA */}
            <div className="space-y-4">
              <div>
                <Label className="text-base">Reset MFA</Label>
                <p className="text-xs text-muted-foreground">
                  Force user to set up MFA again on next login
                </p>
              </div>

              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={handleResetMFA}
                disabled={resetTOTP.isPending}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {resetTOTP.isPending ? 'Resetting...' : 'Reset MFA'}
              </Button>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
