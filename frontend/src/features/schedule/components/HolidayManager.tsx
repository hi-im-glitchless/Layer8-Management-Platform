import { useState } from 'react'
import { CalendarDays, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHolidays, useCreateHoliday, useUpdateHoliday, useDeleteHoliday } from '../hooks'
import type { Holiday } from '../types'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function formatHolidayDate(month: number, day: number): string {
  const date = new Date(2000, month - 1, day)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long' })
}

export function HolidayManager() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; month: number; day: number; isRecurring: boolean }>({
    name: '', month: 1, day: 1, isRecurring: true,
  })
  const [newName, setNewName] = useState('')
  const [newMonth, setNewMonth] = useState<number>(1)
  const [newDay, setNewDay] = useState('')
  const [newRecurring, setNewRecurring] = useState(true)

  const holidaysQuery = useHolidays()
  const createHoliday = useCreateHoliday()
  const updateHoliday = useUpdateHoliday()
  const deleteHoliday = useDeleteHoliday()

  const holidays: Holiday[] = holidaysQuery.data?.holidays ?? []

  const handleCreate = () => {
    const day = parseInt(newDay, 10)
    if (!newName.trim() || isNaN(day) || day < 1 || day > 31) return
    createHoliday.mutate(
      { name: newName.trim(), month: newMonth, day, isRecurring: newRecurring },
      {
        onSuccess: () => {
          setNewName('')
          setNewDay('')
          setNewMonth(1)
          setNewRecurring(true)
        },
      }
    )
  }

  const startEdit = (holiday: Holiday) => {
    setEditingId(holiday.id)
    setEditForm({
      name: holiday.name,
      month: holiday.month,
      day: holiday.day,
      isRecurring: holiday.isRecurring,
    })
  }

  const handleSaveEdit = () => {
    if (!editingId || !editForm.name.trim()) return
    updateHoliday.mutate(
      { id: editingId, data: editForm },
      { onSuccess: () => setEditingId(null) }
    )
  }

  const handleCancelEdit = () => setEditingId(null)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarDays className="mr-2 h-4 w-4" />
          Manage Holidays
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Holidays</DialogTitle>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[80px]">Recurring</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.map((holiday) =>
              editingId === holiday.id ? (
                <TableRow key={holiday.id}>
                  <TableCell>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Select
                        value={String(editForm.month)}
                        onValueChange={(v) => setEditForm({ ...editForm, month: parseInt(v, 10) })}
                      >
                        <SelectTrigger className="h-8 w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={editForm.day}
                        onChange={(e) => setEditForm({ ...editForm, day: parseInt(e.target.value, 10) || 1 })}
                        className="h-8 w-[60px]"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={editForm.isRecurring}
                      onCheckedChange={(checked) =>
                        setEditForm({ ...editForm, isRecurring: checked === true })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600"
                        onClick={handleSaveEdit}
                        disabled={updateHoliday.isPending}
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
                <TableRow key={holiday.id}>
                  <TableCell className="font-medium">{holiday.name}</TableCell>
                  <TableCell>{formatHolidayDate(holiday.month, holiday.day)}</TableCell>
                  <TableCell>{holiday.isRecurring ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(holiday)}
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
                            <AlertDialogTitle>Delete holiday?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete <strong>{holiday.name}</strong>.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteHoliday.mutate(holiday.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              )
            )}
            {holidays.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  No holidays configured.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Add Holiday Form */}
        <div className="border rounded-md p-3 space-y-3">
          <h4 className="text-sm font-medium">Add Holiday</h4>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Holiday name"
                className="h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Month</label>
              <Select value={String(newMonth)} onValueChange={(v) => setNewMonth(parseInt(v, 10))}>
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Day</label>
              <Input
                type="number"
                min={1}
                max={31}
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
                placeholder="1-31"
                className="h-8 w-[70px]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="new-recurring"
                checked={newRecurring}
                onCheckedChange={(checked) => setNewRecurring(checked === true)}
              />
              <label htmlFor="new-recurring" className="text-xs">
                Recurring
              </label>
            </div>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || !newDay || createHoliday.isPending}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
