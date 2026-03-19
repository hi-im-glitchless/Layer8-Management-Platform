import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useImportExcel } from '../hooks'

interface ExcelImportDialogProps {
  year: number
}

export function ExcelImportDialog({ year }: ExcelImportDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importMutation = useImportExcel()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    importMutation.reset()
  }

  const handleImport = () => {
    if (!selectedFile) return
    importMutation.mutate(
      { file: selectedFile, year },
      {
        onSuccess: () => {
          // Keep dialog open to show results
        },
      }
    )
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedFile(null)
      importMutation.reset()
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    setOpen(isOpen)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Upload className="h-4 w-4" />
          Importar Excel
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Excel</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx) to import schedule assignments for {year}.
            Team member names must match existing members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File input */}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="excel-file">
              Excel File
            </label>
            <input
              ref={fileInputRef}
              id="excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          {/* File preview */}
          {selectedFile && (
            <div className="flex items-center gap-3 rounded-md border p-3 bg-muted/50">
              <FileSpreadsheet className="h-8 w-8 text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
          )}

          {/* Import button */}
          <button
            onClick={handleImport}
            disabled={!selectedFile || importMutation.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Importar
              </>
            )}
          </button>

          {/* Success result */}
          {importMutation.isSuccess && importMutation.data && (
            <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3 space-y-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Import complete</span>
              </div>
              <div className="text-sm text-green-700 dark:text-green-400 space-y-1">
                <p>Imported: {importMutation.data.imported} assignments</p>
                <p>Skipped: {importMutation.data.skipped}</p>
                {importMutation.data.summary && (
                  <p className="text-xs text-muted-foreground">
                    Parsed {importMutation.data.summary.totalParsed} entries from{' '}
                    {importMutation.data.summary.membersFound} members across{' '}
                    {importMutation.data.summary.weeksFound} weeks
                  </p>
                )}
              </div>

              {/* Error rows */}
              {importMutation.data.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="text-xs font-medium">
                      {importMutation.data.errors.length} issue(s):
                    </span>
                  </div>
                  <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
                    {importMutation.data.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                    {importMutation.data.errors.length > 20 && (
                      <li className="text-amber-600">
                        ...and {importMutation.data.errors.length - 20} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {importMutation.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  {importMutation.error?.message || 'Failed to import file'}
                </span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
