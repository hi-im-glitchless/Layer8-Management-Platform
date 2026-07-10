import { useSearchParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useClients } from '@/features/schedule/hooks'
import { ClientNotesModal } from '@/features/schedule/components/ClientNotesModal'
import type { Client } from '@/features/schedule/types'

export function ClientNotes() {
  const { data, isLoading, isError, error, refetch } = useClients()
  const clients: Client[] = data?.clients ?? []

  // Modal open state driven by the ?client=<id> URL search param (Board.tsx
  // pattern): one-open-at-a-time, deep-linkable, cleared by deleting the param.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedClientId = searchParams.get('client') ?? null
  const setSelectedClientId = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id === null) next.delete('client')
        else next.set('client', id)
        return next
      },
      { replace: true },
    )
  }

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null

  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Client Notes</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">
            Failed to load clients
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {error?.message ?? 'An unexpected error occurred'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Client Notes</h1>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">Color</TableHead>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="w-6 h-6 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                </TableRow>
              ))
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-10">
                  No clients configured.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedClientId(client.id)}
                >
                  <TableCell>
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ backgroundColor: client.color }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{client.name}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClientNotesModal
        clientId={selectedClientId}
        client={selectedClient}
        open={selectedClientId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedClientId(null)
        }}
      />
    </div>
  )
}
