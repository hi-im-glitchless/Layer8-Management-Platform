import { AuditLogViewer } from '@/components/admin/AuditLogViewer'

export function AuditLog() {
  return (
    <div className="space-y-6">
      <AuditLogViewer adminMode={false} />
    </div>
  )
}
