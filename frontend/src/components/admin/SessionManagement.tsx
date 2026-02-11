import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useSessions, useTerminateSession, useCleanupSessions } from '@/features/admin/hooks'
import type { ActiveSession } from '@/features/admin/types'
import { Trash2, Activity, UserX } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function SessionManagement() {
  const { data, isLoading } = useSessions()
  const terminateSession = useTerminateSession()
  const cleanupSessions = useCleanupSessions()
  const [terminatingId, setTerminatingId] = useState<string | null>(null)

  const handleTerminate = async (sessionId: string) => {
    setTerminatingId(sessionId)
    try {
      await terminateSession.mutateAsync(sessionId)
    } catch (error) {
      // Error handled by mutation hook
    } finally {
      setTerminatingId(null)
    }
  }

  const handleCleanup = async () => {
    try {
      await cleanupSessions.mutateAsync()
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Active Sessions</h2>
          <p className="text-muted-foreground">
            Monitor and manage active user sessions
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              disabled={cleanupSessions.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {cleanupSessions.isPending ? 'Cleaning...' : 'Cleanup Expired'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cleanup expired sessions?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all expired sessions and trusted devices from the system. Active sessions will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleCleanup}>
                Cleanup
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data?.sessions.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <UserX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No active sessions</h3>
          <p className="text-muted-foreground">
            No users are currently logged in
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.sessions.map((session: ActiveSession) => (
                <TableRow key={session.sessionId} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-600" />
                      {session.username}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {session.ipAddress || 'N/A'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(session.lastActivity), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(session.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={terminatingId === session.sessionId}
                        >
                          {terminatingId === session.sessionId ? 'Ending...' : 'Terminate'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Terminate session?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will immediately log out <span className="font-semibold">{session.username}</span>. They will need to sign in again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleTerminate(session.sessionId)}
                          >
                            Terminate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Auto-refreshes every 30 seconds
      </div>
    </div>
  )
}
