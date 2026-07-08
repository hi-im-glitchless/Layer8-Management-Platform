import { useRef, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useDeleteFile, useDownloadFile, useUploadFile } from '../hooks'
import { MAX_CARD_BYTES, type BoardFile } from '../types'
import { toast } from 'sonner'

interface FilesPanelProps {
  cardId: string
  files: BoardFile[]
  canDelete: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Map upload-error HTTP codes (set by backend plan 23-03) to user-facing
 * toasts. Anything else falls through to the default error toast emitted
 * by handleMutationError inside useUploadFile.
 */
function uploadErrorToast(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 413) {
      // The backend tags its two board-file 413s so we can show the right
      // message: a single over-500MB file vs the per-card 500 MB quota.
      const reason =
        err.data && typeof err.data === 'object' && 'reason' in err.data
          ? (err.data as { reason?: unknown }).reason
          : undefined
      if (reason === 'FILE_TOO_LARGE') {
        toast.error('File too large — maximum is 500MB.')
        return true
      }
      toast.error('Quota exceeded — this card already holds close to 500 MB.')
      return true
    }
    if (err.status === 415) {
      toast.error('File type not allowed.')
      return true
    }
    if (err.status === 422) {
      toast.error('File failed virus scan.')
      return true
    }
    if (err.status === 503) {
      toast.error('Virus scanner unavailable, try again later.')
      return true
    }
  }
  return false
}

export function FilesPanel({ cardId, files, canDelete }: FilesPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadFile()
  const download = useDownloadFile()
  const remove = useDeleteFile()
  const [dragOver, setDragOver] = useState(false)

  const usedBytes = files.reduce((sum, f) => (f.isQuarantined ? sum : sum + f.sizeBytes), 0)
  const usedPct = Math.min(100, Math.round((usedBytes / MAX_CARD_BYTES) * 100))

  const startUpload = (file: File) => {
    if (usedBytes + file.size > MAX_CARD_BYTES) {
      toast.error('This file would exceed the per-card 500 MB quota.')
      return
    }
    upload.mutate(
      { cardId, file },
      {
        onError: (err) => {
          uploadErrorToast(err)
        },
      },
    )
  }

  const handlePick = () => inputRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) startUpload(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) startUpload(file)
  }

  const handleDelete = (fileId: string) => {
    if (!confirm('Delete this file? This cannot be undone.')) return
    remove.mutate({ cardId, fileId })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Files</h3>
        <div className="text-xs text-muted-foreground">
          {formatBytes(usedBytes)} / {formatBytes(MAX_CARD_BYTES)}
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${usedPct}%` }}
          aria-label={`Storage used: ${usedPct}%`}
          role="progressbar"
          aria-valuenow={usedPct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex items-center justify-center gap-2 rounded-md border border-dashed py-6 text-sm cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-input'
        } ${upload.isPending ? 'opacity-60 pointer-events-none' : ''}`}
        onClick={handlePick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handlePick()
        }}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">
          {upload.isPending ? 'Uploading…' : 'Drop a file or click to upload'}
        </span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No files yet.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{f.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(f.sizeBytes)} • {formatDate(f.createdAt)}
                  {f.isQuarantined && (
                    <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">
                      quarantined
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  download.mutate({ cardId, fileId: f.id, filename: f.filename })
                }
                disabled={download.isPending || f.isQuarantined}
                aria-label={`Download ${f.filename}`}
              >
                <Download className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(f.id)}
                  disabled={remove.isPending}
                  aria-label={`Delete ${f.filename}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
