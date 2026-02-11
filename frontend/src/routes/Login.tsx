import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Layer8</CardTitle>
          <CardDescription>
            Security reporting platform for pentesters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-center text-muted-foreground">
              Full authentication UI coming in Phase 01, Plan 04
            </p>
            <Link to="/">
              <Button className="w-full">Enter App (Temporary)</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
