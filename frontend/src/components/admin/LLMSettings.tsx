import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { Eye, EyeOff, Play, RefreshCw } from 'lucide-react'

interface LLMSettingsData {
  cliproxyBaseUrl: string
  anthropicApiKey: string | null
  defaultModel: string
  templateAdapterModel: string
  executiveReportModel: string
  fallbackEnabled: boolean
}

interface ProviderStatus {
  provider: string
  available: boolean
  error?: string
}

interface LLMStatusResponse {
  providers: ProviderStatus[]
}

interface StartCliProxyResponse {
  success: boolean
  message: string
}

export function LLMSettings() {
  const queryClient = useQueryClient()
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyDirty, setApiKeyDirty] = useState(false)

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin', 'llm-settings'],
    queryFn: () => apiClient<LLMSettingsData>('/api/admin/llm-settings'),
    staleTime: 30_000,
  })

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['admin', 'llm-status'],
    queryFn: () => apiClient<LLMStatusResponse>('/api/admin/llm-status'),
    staleTime: 15_000,
  })

  const updateSettings = useMutation({
    mutationFn: (data: Partial<LLMSettingsData>) =>
      apiClient<LLMSettingsData>('/api/admin/llm-settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'llm-settings'], data)
      setApiKeyDirty(false)
      toast.success('LLM settings updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update settings')
    },
  })

  const startCliProxy = useMutation({
    mutationFn: () =>
      apiClient<StartCliProxyResponse>('/api/admin/llm-start-cliproxy', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.info(data.message)
      }
      refetchStatus()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start CLIProxyAPI')
    },
  })

  const [formState, setFormState] = useState<Partial<LLMSettingsData>>({})

  // Derive effective values (form overrides or current settings)
  const effective = {
    defaultModel: formState.defaultModel ?? settings?.defaultModel ?? '',
    templateAdapterModel: formState.templateAdapterModel ?? settings?.templateAdapterModel ?? '',
    executiveReportModel: formState.executiveReportModel ?? settings?.executiveReportModel ?? '',
    fallbackEnabled: formState.fallbackEnabled ?? settings?.fallbackEnabled ?? false,
  }

  const isDirty = Object.keys(formState).length > 0 || apiKeyDirty

  const handleSave = () => {
    const data: Partial<LLMSettingsData> = { ...formState }
    if (apiKeyDirty && apiKeyInput !== '') {
      data.anthropicApiKey = apiKeyInput
    }
    updateSettings.mutate(data)
    setFormState({})
    setApiKeyInput('')
  }

  const cliproxy = status?.providers.find((p) => p.provider === 'cliproxy')
  const anthropic = status?.providers.find((p) => p.provider === 'anthropic')

  if (settingsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Provider Status */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
          <CardDescription>LLM provider availability and health</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      cliproxy?.available ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <div>
                    <p className="font-medium">CLIProxyAPI</p>
                    <p className="text-sm text-muted-foreground">
                      {cliproxy?.available
                        ? 'Running'
                        : cliproxy?.error || 'Not running'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!cliproxy?.available && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startCliProxy.mutate()}
                      disabled={startCliProxy.isPending}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      {startCliProxy.isPending ? 'Starting...' : 'Start CLIProxyAPI'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchStatus()}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full ${
                    anthropic ? 'bg-green-500' : 'bg-muted-foreground'
                  }`}
                />
                <div>
                  <p className="font-medium">Anthropic API</p>
                  <p className="text-sm text-muted-foreground">
                    {settings?.anthropicApiKey
                      ? `Configured (key: ${settings.anthropicApiKey})`
                      : 'Not configured'}
                  </p>
                </div>
                <Badge variant={settings?.fallbackEnabled ? 'default' : 'secondary'} className="ml-auto">
                  {settings?.fallbackEnabled ? 'Fallback enabled' : 'Fallback disabled'}
                </Badge>
              </div>

              {!cliproxy?.available && !settings?.anthropicApiKey && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/50 p-3 text-sm text-orange-700 dark:text-orange-300">
                  CLIProxyAPI is not running and no Anthropic API key is configured.
                  Configure an API key below to use as fallback.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Model Configuration</CardTitle>
          <CardDescription>Per-feature model selection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="defaultModel">Default Model</Label>
            <Input
              id="defaultModel"
              value={effective.defaultModel}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, defaultModel: e.target.value }))
              }
              placeholder="claude-sonnet-4-5-20250929"
            />
            <p className="text-xs text-muted-foreground">
              Used for general/unspecified LLM requests
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="templateAdapterModel">Template Adapter Model</Label>
            <Input
              id="templateAdapterModel"
              value={effective.templateAdapterModel}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, templateAdapterModel: e.target.value }))
              }
              placeholder="claude-sonnet-4-5-20250929"
            />
            <p className="text-xs text-muted-foreground">
              Used for template analysis and Jinja2 placeholder insertion (Sonnet 4.5 recommended)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="executiveReportModel">Executive Report Model</Label>
            <Input
              id="executiveReportModel"
              value={effective.executiveReportModel}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, executiveReportModel: e.target.value }))
              }
              placeholder="claude-opus-4-6"
            />
            <p className="text-xs text-muted-foreground">
              Used for executive report generation and report modifications (Opus 4.6 recommended)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Provider Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Configuration</CardTitle>
          <CardDescription>API keys and fallback settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="anthropicApiKey">Anthropic API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="anthropicApiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyDirty ? apiKeyInput : (settings?.anthropicApiKey || '')}
                  onChange={(e) => {
                    setApiKeyDirty(true)
                    setApiKeyInput(e.target.value)
                  }}
                  placeholder="sk-ant-..."
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
                type="button"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {settings?.anthropicApiKey && !apiKeyDirty && (
              <p className="text-xs text-muted-foreground">
                Current key: {settings.anthropicApiKey}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="fallbackEnabled">Enable Anthropic Fallback</Label>
              <p className="text-xs text-muted-foreground">
                Fall back to Anthropic API if CLIProxyAPI is unavailable
              </p>
            </div>
            <Switch
              id="fallbackEnabled"
              checked={effective.fallbackEnabled}
              onCheckedChange={(checked) =>
                setFormState((prev) => ({ ...prev, fallbackEnabled: checked }))
              }
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={!isDirty || updateSettings.isPending}
          >
            {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Token Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Token Usage</CardTitle>
          <CardDescription>System-wide LLM token consumption</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            View detailed LLM usage in the Audit Log tab by filtering for "llm.generate" events.
            Each audit entry shows input/output token counts per request.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
