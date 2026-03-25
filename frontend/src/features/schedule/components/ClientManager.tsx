import { useState } from 'react'
import { Building2, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useClients, useCreateClient, useUpdateClient, useDeleteClient } from '../hooks'
import { ColorPalette } from './ColorPalette'
import { COLOR_PALETTE } from '../constants'
import { useAuth } from '@/features/auth/hooks'
import type { Client } from '../types'

export function ClientManager() {
  const { hasRole } = useAuth()
  const canManage = hasRole('PM')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; color: string }>({
    name: '',
    color: COLOR_PALETTE[0].hex,
  })
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(COLOR_PALETTE[0].hex)

  const clientsQuery = useClients()
  const createClient = useCreateClient()
  const updateClient = useUpdateClient()
  const deleteClient = useDeleteClient()

  const clients: Client[] = clientsQuery.data?.clients ?? []

  const handleCreate = () => {
    if (!newName.trim()) return
    createClient.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          setNewName('')
          setNewColor(COLOR_PALETTE[0].hex)
        },
      }
    )
  }

  const startEdit = (client: Client) => {
    setEditingId(client.id)
    setEditForm({ name: client.name, color: client.color })
  }

  const handleSaveEdit = () => {
    if (!editingId || !editForm.name.trim()) return
    updateClient.mutate(
      { id: editingId, data: editForm },
      { onSuccess: () => setEditingId(null) }
    )
  }

  const handleCancelEdit = () => setEditingId(null)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Building2 className="mr-2 h-4 w-4" />
          {canManage ? 'Manage Clients' : 'View Clients'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{canManage ? 'Manage Clients' : 'Clients'}</DialogTitle>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">Color</TableHead>
              <TableHead>Name</TableHead>
              {canManage && <TableHead className="w-[80px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) =>
              editingId === client.id ? (
                <TableRow key={client.id}>
                  <TableCell>
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ backgroundColor: editForm.color }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-8"
                      />
                      <ColorPalette
                        selectedColor={editForm.color}
                        onColorSelect={(hex) => setEditForm({ ...editForm, color: hex })}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600"
                        onClick={handleSaveEdit}
                        disabled={updateClient.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleCancelEdit}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={client.id}>
                  <TableCell>
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ backgroundColor: client.color }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEdit(client)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete client?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will unlink all assignments from <strong>{client.name}</strong>. Continue?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteClient.mutate(client.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            )}
            {clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 3 : 2} className="text-center text-muted-foreground py-6">
                  {canManage ? 'No clients yet. Add one below.' : 'No clients configured.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {canManage && (
          <div className="border rounded-md p-3 space-y-3">
            <h4 className="text-sm font-medium">Add Client</h4>
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Client name"
                    className="h-8"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!newName.trim() || createClient.isPending}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                <ColorPalette
                  selectedColor={newColor}
                  onColorSelect={setNewColor}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
