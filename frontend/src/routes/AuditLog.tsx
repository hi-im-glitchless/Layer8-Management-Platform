import { AuditLogViewer } from '@/components/admin/AuditLogViewer'

export function AuditLog() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground mt-2">
          View security and compliance audit trail
        </p>
      </div>
      <AuditLogViewer adminMode={false} />
    </div>
  )
}
