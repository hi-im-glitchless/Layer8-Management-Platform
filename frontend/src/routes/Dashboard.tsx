import { useNavigate } from 'react-router-dom'
import { FileCode, FileText } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/hooks'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const name = user?.displayName || user?.username || ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {name ? `${getGreeting()}, ${name}` : getGreeting()}
        </h1>
        <p className="text-muted-foreground mt-2">
          Your AI-powered security reporting hub
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer border bg-card transition-colors hover:bg-accent/10"
          onClick={() => navigate('/template-adapter')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <FileCode className="h-8 w-8 text-muted-foreground" />
            <div>
              <CardTitle>New Template Adaptation</CardTitle>
              <CardDescription>
                Upload and adapt a DOCX template with AI-powered placeholder mapping
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer border bg-card transition-colors hover:bg-accent/10"
          onClick={() => navigate('/executive-report')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <CardTitle>New Executive Report</CardTitle>
              <CardDescription>
                Generate a professional executive report from your technical findings
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
