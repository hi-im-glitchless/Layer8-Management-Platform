import { Fragment, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import { useAuditLogs, useExportAuditLogs, useVerifyChain, usePurgeAuditLogs } from '@/features/audit/hooks'
import { useUsers } from '@/features/admin/hooks'
import type { AuditFilters, AuditLog } from '@/features/audit/api'
import type { AdminUser } from '@/features/admin/types'
import { Download, ShieldCheck, ChevronDown, ChevronRight, FileText, Trash2, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface AuditLogViewerProps {
  adminMode: boolean
}

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'totp.setup', label: 'TOTP Setup' },
  { value: 'totp.verify', label: 'TOTP Verify' },
  { value: 'password.change', label: 'Password Change' },
  { value: 'admin.user.create', label: 'Admin: User Create' },
  { value: 'admin.user.update', label: 'Admin: User Update' },
  { value: 'admin.user.delete', label: 'Admin: User Delete' },
  { value: 'admin.user.password-reset', label: 'Admin: Password Reset' },
  { value: 'admin.user.totp-reset', label: 'Admin: TOTP Reset' },
  { value: 'admin.session.terminate', label: 'Admin: Session Terminate' },
  { value: 'admin.session.cleanup', label: 'Admin: Session Cleanup' },
]

function getActionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' {
  if (action.startsWith('login')) return 'default'
  if (action.startsWith('admin')) return 'destructive'
  if (action.includes('error') || action.includes('fail')) return 'destructive'
  return 'secondary'
}

export function AuditLogViewer({ adminMode }: AuditLogViewerProps) {
  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    pageSize: 25,
  })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [confirmPurge, setConfirmPurge] = useState(false)

  const { data: auditData, isLoading, error: auditError } = useAuditLogs(filters)
  const { data: usersData } = useUsers()
  const exportLogs = useExportAuditLogs()
  const verifyChain = useVerifyChain()
  const purgeLogs = usePurgeAuditLogs()

  const handleFilterChange = (key: keyof AuditFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      // Reset to page 1 when filters change, but not when navigating pages
      ...(key !== 'page' && key !== 'pageSize' ? { page: 1 } : {}),
    }))
  }

  const handleClearFilters = () => {
    setFilters({
      page: 1,
      pageSize: filters.pageSize,
    })
  }

  const handleExport = async () => {
    try {
      await exportLogs.mutateAsync(filters)
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  const handleVerifyChain = async () => {
    try {
      await verifyChain.mutateAsync()
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  const handlePurge = async () => {
    try {
      await purgeLogs.mutateAsync()
      setConfirmPurge(false)
    } catch (error) {
      // Error handled by mutation hook
    }
  }

  const toggleRowExpanded = (logId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) {
        next.delete(logId)
      } else {
        next.add(logId)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {adminMode ? 'Audit Logs' : 'Activity Log'}
          </h2>
          <p className="text-muted-foreground">
            {adminMode
              ? 'View all system audit logs with filtering and export'
              : 'View your recent activity'}
          </p>
        </div>
        {adminMode && (
          <div className="flex gap-2">
            {confirmPurge ? (
              <div className="flex items-center gap-2 border border-destructive rounded-lg px-3 py-1.5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive font-medium">Delete all logs?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handlePurge}
                  disabled={purgeLogs.isPending}
                >
                  {purgeLogs.isPending ? 'Purging...' : 'Confirm'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmPurge(false)}
                  disabled={purgeLogs.isPending}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setConfirmPurge(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Purge All
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleVerifyChain}
              disabled={verifyChain.isPending}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {verifyChain.isPending ? 'Verifying...' : 'Verify Chain'}
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exportLogs.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              {exportLogs.isPending ? 'Exporting...' : 'Export JSON'}
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {adminMode && (
            <div>
              <Label htmlFor="filter-user">User</Label>
              <Select
                value={filters.userId || 'all'}
                onValueChange={(value) =>
                  handleFilterChange('userId', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger id="filter-user">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {usersData?.users.map((user: AdminUser) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="filter-action">Action Type</Label>
            <Select
              value={filters.action || 'all'}
              onValueChange={(value) =>
                handleFilterChange('action', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger id="filter-action">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="filter-start">Start Date</Label>
            <Input
              id="filter-start"
              type="date"
              value={filters.startDate || ''}
              onChange={(e) =>
                handleFilterChange('startDate', e.target.value || undefined)
              }
            />
          </div>

          <div>
            <Label htmlFor="filter-end">End Date</Label>
            <Input
              id="filter-end"
              type="date"
              value={filters.endDate || ''}
              onChange={(e) =>
                handleFilterChange('endDate', e.target.value || undefined)
              }
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilters}
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Table */}
      {auditError ? (
        <div className="text-center py-12 border rounded-lg border-destructive/50">
          <FileText className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load audit logs</h3>
          <p className="text-muted-foreground">
            {auditError.message || 'An error occurred while fetching audit logs'}
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : auditData?.logs.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No logs found</h3>
          <p className="text-muted-foreground">
            No audit logs match the current filters
          </p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]"></TableHead>
                  <TableHead>Timestamp</TableHead>
                  {adminMode && <TableHead>User</TableHead>}
                  <TableHead>Action</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditData?.logs.map((log: AuditLog) => {
                  const isExpanded = expandedRows.has(log.id)
                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRowExpanded(log.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDistanceToNow(new Date(log.timestamp), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        {adminMode && (
                          <TableCell className="font-medium">
                            {log.username || 'Unknown'}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(log.action)}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {log.ipAddress || 'N/A'}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${log.id}-details`}>
                          <TableCell colSpan={adminMode ? 5 : 4}>
                            <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                              <div className="text-sm font-semibold">Details:</div>
                              <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
                                <div>
                                  <span className="font-semibold">Log ID:</span>{' '}
                                  {log.id}
                                </div>
                                <div>
                                  <span className="font-semibold">User Agent:</span>{' '}
                                  {log.userAgent || 'N/A'}
                                </div>
                                <div>
                                  <span className="font-semibold">Current Hash:</span>{' '}
                                  <span className="font-mono">
                                    {log.currentHash.substring(0, 16)}...
                                  </span>
                                </div>
                                <div>
                                  <span className="font-semibold">Previous Hash:</span>{' '}
                                  <span className="font-mono">
                                    {log.previousHash
                                      ? `${log.previousHash.substring(0, 16)}...`
                                      : 'Genesis'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {auditData && (
            <Pagination
              page={filters.page || 1}
              pageSize={filters.pageSize || 25}
              total={auditData.total}
              onPageChange={(page) => handleFilterChange('page', page)}
              onPageSizeChange={(pageSize) =>
                handleFilterChange('pageSize', pageSize)
              }
            />
          )}
        </>
      )}
    </div>
  )
}
