import { useState } from 'react'
import { Users, UserPlus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
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
import { useTeamMembers, useCreateTeamMember, useArchiveTeamMember, useReorderTeamMembers } from '../hooks'
import { useUsers } from '@/features/admin/hooks'
import type { TeamMember } from '../types'

export function TeamManagementPanel() {
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const teamMembersQuery = useTeamMembers()
  const usersQuery = useUsers()
  const createMember = useCreateTeamMember()
  const archiveMember = useArchiveTeamMember()
  const reorderMembers = useReorderTeamMembers()

  const teamMembers: TeamMember[] = teamMembersQuery.data?.teamMembers ?? []
  const allUsers = usersQuery.data?.users ?? []

  const teamUserIds = new Set(teamMembers.map((m) => m.userId))
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
          <div className="flex flex-col gap-1">
            {teamMembers.map((member, index) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium shrink-0">
                    {(member.user.displayName || member.user.username)
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <span className="text-sm truncate">
                    {member.user.displayName || member.user.username}
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
                          {member.user.displayName || member.user.username}
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
