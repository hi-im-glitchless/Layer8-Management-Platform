import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserManagement } from '@/components/admin/UserManagement'
import { SessionManagement } from '@/components/admin/SessionManagement'
import { AuditLogViewer } from '@/components/admin/AuditLogViewer'
import { useAuth } from '@/features/auth/hooks'
import { toast } from 'sonner'
import { LLMSettings } from '@/components/admin/LLMSettings'
import { Shield, Users, Activity, FileText, Bot } from 'lucide-react'

export function Admin() {
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    if (user && !user.isAdmin) {
      toast.error('Access denied: Admin privileges required')
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  if (!user || !user.isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-6 w-6 text-destructive" />
          <h1 className="text-3xl font-bold">Admin Panel</h1>
        </div>
        <p className="text-muted-foreground">
          Manage users, sessions, and system audit logs
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Activity className="h-4 w-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="llm" className="gap-2">
            <Bot className="h-4 w-4" />
            LLM
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <FileText className="h-4 w-4" />
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionManagement />
        </TabsContent>

        <TabsContent value="llm">
          <LLMSettings />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogViewer adminMode={true} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
