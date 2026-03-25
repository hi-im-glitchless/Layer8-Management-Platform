import { useState, useCallback } from 'react'
import { Users, UserPlus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { useTeamMembers, useCreateTeamMember, useArchiveTeamMember, useReorderTeamMembers, useUpdateTeamMember } from '../hooks'
import { useUsers } from '@/features/admin/hooks'
import type { TeamMember } from '../types'

export function TeamManagementPanel() {
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null)
  const [aliasValue, setAliasValue] = useState('')

  const teamMembersQuery = useTeamMembers()
  const usersQuery = useUsers()
  const createMember = useCreateTeamMember()
  const archiveMember = useArchiveTeamMember()
  const reorderMembers = useReorderTeamMembers()
  const updateMember = useUpdateTeamMember()

  const allTeamMembers: TeamMember[] = teamMembersQuery.data?.teamMembers ?? []
  // Filter out backlog members — they are managed by the schedule grid, not this panel
  const teamMembers = allTeamMembers.filter((m) => !m.isBacklog)
  const allUsers = usersQuery.data?.users ?? []

  const teamUserIds = new Set(teamMembers.map((m) => m.userId).filter(Boolean))
  const availableUsers = allUsers.filter(
    (u) => !teamUserIds.has(u.id) && u.isActive
  )

  const handleAddMember = () => {
    if (!selectedUserId) return
    createMember.mutate(selectedUserId, {
      onSuccess: () => setSelectedUserId(''),
    })
  }

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...teamMembers]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
    reorderMembers.mutate(newOrder.map((m) => m.id))
  }

  const handleStartEditAlias = useCallback((member: TeamMember) => {
    setEditingAliasId(member.id)
    setAliasValue(member.displayName || '')
  }, [])

  const handleSaveAlias = useCallback((memberId: string) => {
    const trimmed = aliasValue.trim()
    updateMember.mutate({
      id: memberId,
      data: { displayName: trimmed || null },
    })
    setEditingAliasId(null)
  }, [aliasValue, updateMember])

  const handleCancelAlias = useCallback(() => {
    setEditingAliasId(null)
    setAliasValue('')
  }, [])

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="mr-2 h-4 w-4" />
          Manage Team
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Manage Team</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Add Member */}
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAddMember}
              disabled={!selectedUserId || createMember.isPending}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>

          {/* Team Member List */}
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-12rem)]">
            {teamMembers.map((member, index) => (
              <div
                key={member.id}
                className="flex flex-col gap-1.5 rounded-md border px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                      {(member.user?.displayName || member.user?.username || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <span className="text-sm truncate">
                      {member.user?.displayName || member.user?.username || 'Unknown'}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0 || reorderMembers.isPending}
                      onClick={() => handleReorder(index, 'up')}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === teamMembers.length - 1 || reorderMembers.isPending}
                      onClick={() => handleReorder(index, 'down')}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Archive team member?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will archive{' '}
                          <strong>
                            {member.user?.displayName || member.user?.username || 'Unknown'}
                          </strong>{' '}
                          from the schedule. Their existing assignments will be
                          preserved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => archiveMember.mutate(member.id)}
                        >
                          Archive
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  </div>
                </div>

                {/* Alias / schedule nickname */}
                <div className="pl-9">
                  {editingAliasId === member.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={aliasValue}
                        onChange={(e) => setAliasValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveAlias(member.id)
                          if (e.key === 'Escape') handleCancelAlias()
                        }}
                        placeholder="Schedule alias (optional)"
                        className="h-7 text-xs"
                        maxLength={50}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-green-600"
                        onClick={() => handleSaveAlias(member.id)}
                        disabled={updateMember.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={handleCancelAlias}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartEditAlias(member)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      {member.displayName ? (
                        <span>Alias: <span className="font-medium text-foreground">{member.displayName}</span></span>
                      ) : (
                        <span>Set schedule alias</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {teamMembers.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No team members yet. Add a user to get started.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
