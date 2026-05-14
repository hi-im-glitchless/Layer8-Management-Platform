import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/hooks'

interface Props {
  filterMode: 'mine' | 'all'
  setFilterMode: (mode: 'mine' | 'all') => void
  filterClientId: string | null
  setFilterClientId: (id: string | null) => void
  filterPentesterId: string | null
  setFilterPentesterId: (id: string | null) => void
  showArchived: boolean
  setShowArchived: (show: boolean) => void
  clients: { id: string; name: string }[]
  pentesters: { id: string; name: string }[]
}

export function BoardFilters({
  filterMode,
  setFilterMode,
  filterClientId,
  setFilterClientId,
  filterPentesterId,
  setFilterPentesterId,
  showArchived,
  setShowArchived,
  clients,
  pentesters,
}: Props) {
  const { hasRole } = useAuth()

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* My / All toggle */}
      <div className="flex rounded-md border border-input">
        <Button
          variant={filterMode === 'mine' ? 'default' : 'outline'}
          size="sm"
          className="rounded-r-none border-0"
          onClick={() => setFilterMode('mine')}
        >
          My Projects
        </Button>
        <Button
          variant={filterMode === 'all' ? 'default' : 'outline'}
          size="sm"
          className="rounded-l-none border-0"
          onClick={() => setFilterMode('all')}
        >
          All Projects
        </Button>
      </div>

      {/* Client filter */}
      <Select
        value={filterClientId ?? '__all__'}
        onValueChange={(v) => setFilterClientId(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="All clients" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All clients</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Pentester filter */}
      <Select
        value={filterPentesterId ?? '__all__'}
        onValueChange={(v) => setFilterPentesterId(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="All pentesters" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All pentesters</SelectItem>
          {pentesters.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Show Archived toggle — ADMIN only */}
      {hasRole('ADMIN') && (
        <div className="flex items-center gap-1.5">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
            Show Archived
          </label>
        </div>
      )}
    </div>
  )
}
