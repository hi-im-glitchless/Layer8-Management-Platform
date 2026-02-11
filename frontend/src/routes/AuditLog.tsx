import { AuditLogViewer } from '@/components/admin/AuditLogViewer'

export function AuditLog() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground mt-2">
          View your recent activity and actions
        </p>
      </div>

      <AuditLogViewer adminMode={false} />
    </div>
  )
}
