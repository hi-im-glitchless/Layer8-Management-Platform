import { useState, useCallback } from 'react'
import { Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileUpload } from '@/components/ui/file-upload'
import { useUploadTemplate } from '../hooks'
import type { TemplateType, TemplateLanguage } from '../types'

interface StepUploadProps {
  onSessionCreate: (sessionId: string) => void
  onFileReady: (file: File) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StepUpload({ onSessionCreate, onFileReady }: StepUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [templateType, setTemplateType] = useState<TemplateType | ''>('')
  const [language, setLanguage] = useState<TemplateLanguage | ''>('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const uploadMutation = useUploadTemplate()

  const handleFileSelect = useCallback(
    (file: File) => {
      setSelectedFile(file)
      setValidationError(null)
      onFileReady(file)
    },
    [onFileReady],
  )

  const handleAnalyze = useCallback(() => {
    // Zod-style validation
    if (!selectedFile) {
      setValidationError('Please select a DOCX file')
      return
    }
    if (!templateType) {
      setValidationError('Please select a template type')
      return
    }
    if (!language) {
      setValidationError('Please select a language')
      return
    }

    setValidationError(null)

    uploadMutation.mutate(
      { file: selectedFile, templateType, language },
      {
        onSuccess: (data) => {
          toast.success('Template uploaded successfully')
          onSessionCreate(data.sessionId)
        },
      },
    )
  }, [selectedFile, templateType, language, uploadMutation, onSessionCreate])

  const isSubmitting = uploadMutation.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Template</CardTitle>
        <CardDescription>
          Select your DOCX template file and configure the template type and language.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File upload */}
        <div>
          <FileUpload
            onFileSelect={handleFileSelect}
            accept=".docx"
            maxSizeMB={50}
            isUploading={isSubmitting}
            disabled={isSubmitting}
            error={
              uploadMutation.isError
                ? (uploadMutation.error as Error).message
                : undefined
            }
          />

          {/* Selected file info */}
          {selectedFile && !isSubmitting && (
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
              <FileText className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{selectedFile.name}</span>
              <span className="text-xs">({formatFileSize(selectedFile.size)})</span>
            </div>
          )}
        </div>

        {/* Configuration row */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Template type */}
          <div className="space-y-2">
            <Label htmlFor="template-type">Template Type</Label>
            <Select
              value={templateType}
              onValueChange={(val) => setTemplateType(val as TemplateType)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="template-type">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web">Web Application</SelectItem>
                <SelectItem value="internal">Internal Network</SelectItem>
                <SelectItem value="mobile">Mobile Application</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label htmlFor="template-language">Language</Label>
            <Select
              value={language}
              onValueChange={(val) => setLanguage(val as TemplateLanguage)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="template-language">
                <SelectValue placeholder="Select language..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pt-pt">Portuguese (PT-PT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Validation error */}
        {validationError && (
          <p className="text-sm text-destructive" role="alert">
            {validationError}
          </p>
        )}

        {/* Submit */}
        <Button
          onClick={handleAnalyze}
          disabled={isSubmitting || !selectedFile}
          className="w-full sm:w-auto"
          variant="gradient"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              Uploading...
            </>
          ) : (
            'Upload & Analyze'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
