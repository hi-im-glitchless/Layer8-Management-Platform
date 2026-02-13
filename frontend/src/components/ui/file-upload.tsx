import { useState, useRef, useCallback } from 'react'
import { Upload, File, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSizeMB?: number
  disabled?: boolean
  isUploading?: boolean
  progress?: number
  error?: string
  className?: string
}

const DEFAULT_ACCEPT = '.docx,.pdf'
const DEFAULT_MAX_SIZE_MB = 50

/** Map of accepted extensions to MIME types for validation */
const MIME_MAP: Record<string, string[]> = {
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pdf': ['application/pdf'],
}

function getAcceptedExtensions(accept: string): string[] {
  return accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.startsWith('.'))
}

function validateFile(
  file: File,
  accept: string,
  maxSizeMB: number,
): string | null {
  const extensions = getAcceptedExtensions(accept)
  const fileName = file.name.toLowerCase()
  const ext = fileName.slice(fileName.lastIndexOf('.'))

  if (!extensions.includes(ext)) {
    return `Invalid file type. Accepted: ${extensions.join(', ')}`
  }

  const allowedMimes = extensions.flatMap((e) => MIME_MAP[e] ?? [])
  if (allowedMimes.length > 0 && !allowedMimes.includes(file.type)) {
    // Some browsers don't report MIME correctly, so only warn if we have a type
    if (file.type && file.type !== 'application/octet-stream') {
      return `Invalid file type "${file.type}". Expected: ${allowedMimes.join(', ')}`
    }
  }

  const maxBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxBytes) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${maxSizeMB} MB`
  }

  return null
}

export function FileUpload({
  onFileSelect,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  disabled = false,
  isUploading = false,
  progress = 0,
  error: externalError,
  className,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const displayError = externalError || validationError
  const isDisabled = disabled || isUploading

  const handleFile = useCallback(
    (file: File) => {
      setValidationError(null)
      const err = validateFile(file, accept, maxSizeMB)
      if (err) {
        setValidationError(err)
        return
      }
      onFileSelect(file)
    },
    [accept, maxSizeMB, onFileSelect],
  )

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (isDisabled) return
      dragCounter.current += 1
      if (dragCounter.current === 1) {
        setIsDragOver(true)
      }
    },
    [isDisabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isDisabled) {
        e.dataTransfer.dropEffect = 'copy'
      }
    },
    [isDisabled],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragOver(false)

      if (isDisabled) return

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFile(files[0])
      }
    },
    [isDisabled, handleFile],
  )

  const handleClick = useCallback(() => {
    if (!isDisabled && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [isDisabled])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
        e.preventDefault()
        fileInputRef.current?.click()
      }
    },
    [isDisabled],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFile(files[0])
      }
      // Reset input so the same file can be re-selected
      e.target.value = ''
    },
    [handleFile],
  )

  const acceptMimes = getAcceptedExtensions(accept)
    .flatMap((ext) => MIME_MAP[ext] ?? [])
    .join(',')
  const inputAccept = [accept, acceptMimes].filter(Boolean).join(',')

  return (
    <div className={cn('w-full', className)}>
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label={`Upload file. Accepted formats: ${accept}. Maximum size: ${maxSizeMB} MB`}
        aria-describedby={displayError ? 'file-upload-error' : undefined}
        aria-disabled={isDisabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isDragOver && !isDisabled
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          isDisabled && 'pointer-events-none opacity-50 cursor-not-allowed',
          displayError && 'border-destructive/50',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={inputAccept}
          onChange={handleInputChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        {isUploading ? (
          <File className="h-10 w-10 text-muted-foreground" />
        ) : (
          <Upload
            className={cn(
              'h-10 w-10',
              isDragOver ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        )}

        <div className="text-center">
          {isDragOver && !isDisabled ? (
            <p className="text-sm font-medium text-primary">
              Drop file here
            </p>
          ) : isUploading ? (
            <p className="text-sm font-medium text-muted-foreground">
              Uploading...
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">
                Drag and drop a file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {accept.replace(/\./g, '').toUpperCase()} files up to {maxSizeMB} MB
              </p>
            </>
          )}
        </div>
      </div>

      {/* Upload progress bar */}
      {isUploading && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Uploading</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {/* Error display */}
      {displayError && (
        <div
          id="file-upload-error"
          className="flex items-center gap-2 mt-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  )
}
