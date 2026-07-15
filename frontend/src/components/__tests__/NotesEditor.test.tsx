import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { NotesEditor } from '../NotesEditor'

// Pure-props harness: the editor no longer calls any hook, so no
// QueryClientProvider / hook-module mock is needed — just plain props and a
// vi.fn() onSave (mirrors client-combobox.test.tsx).

function getTextarea() {
  return screen.getByPlaceholderText(
    'Write notes in markdown — long form is fine.',
  ) as HTMLTextAreaElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotesEditor', () => {
  it('renders Edit and Preview tabs and shows initialNotes in the textarea', () => {
    render(
      <NotesEditor
        initialNotes="# Hello"
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    expect(screen.getByRole('tab', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument()
    expect(getTextarea().value).toBe('# Hello')
  })

  it('defaults to Edit-first: renders Edit trigger before Preview and opens on Edit (client-notes regression guard)', () => {
    render(
      <NotesEditor
        initialNotes="# Hello"
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    // DOM order: Edit before Preview.
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveAccessibleName('Edit')
    expect(tabs[1]).toHaveAccessibleName('Preview')

    // Opens on Edit by default.
    expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('calls onSave exactly once with the edited draft when Save is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <NotesEditor
        initialNotes="original"
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={onSave}
        isSaving={false}
      />,
    )

    fireEvent.change(getTextarea(), { target: { value: 'edited draft text' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('edited draft text')
  })

  it('flips to the Preview tab when onSave resolves', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <NotesEditor
        initialNotes="start"
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={onSave}
        isSaving={false}
      />,
    )

    fireEvent.change(getTextarea(), { target: { value: 'resolved preview body' } })
    // handleSave awaits onSave then setTab('preview') in a microtask; flush it
    // inside act so the pending React update commits.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    // After the awaited resolve the editor switches to Preview and the
    // markdown-rendered draft becomes visible.
    expect(screen.getByText('resolved preview body')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('stays on the Edit tab when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'))
    render(
      <NotesEditor
        initialNotes="start"
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={onSave}
        isSaving={false}
      />,
    )

    fireEvent.change(getTextarea(), { target: { value: 'rejected body' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    // Rejection is swallowed; the editor must remain on Edit (never flip).
    expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('disables Save and Cancel when the draft is not dirty', () => {
    render(
      <NotesEditor
        initialNotes="unchanged"
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows "Saving…" and disables Save while isSaving is true', () => {
    render(
      <NotesEditor
        initialNotes="original"
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={vi.fn()}
        isSaving={true}
      />,
    )

    // Make the draft dirty so the disabled state is driven by isSaving.
    fireEvent.change(getTextarea(), { target: { value: 'dirty' } })

    const saveBtn = screen.getByRole('button', { name: /Saving/ })
    expect(saveBtn).toBeDisabled()
    expect(saveBtn).toHaveTextContent('Saving…')
  })

  it('sanitizes the preview: strips a <script> tag and a javascript: link (SANITIZE_SCHEMA survived the move)', () => {
    const malicious = [
      '<script>alert("xss")</script>',
      '[click me](javascript:alert("xss"))',
    ].join('\n\n')

    const { container } = render(
      <NotesEditor
        initialNotes={malicious}
        notesUpdatedAt={null}
        notesUpdatedBy={null}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )

    // Switch to Preview so the markdown is rendered through rehype-sanitize.
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

    // No executable <script> element makes it into the DOM.
    expect(container.querySelector('script')).toBeNull()

    // Any rendered anchor must not carry a javascript: href (protocol stripped
    // by the hardened schema's defaultSchema protocol allow-list).
    const anchors = Array.from(container.querySelectorAll('a'))
    for (const a of anchors) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    }
  })

  describe('previewFirst', () => {
    it('renders the Preview trigger before the Edit trigger in DOM order', () => {
      render(
        <NotesEditor
          initialNotes="# Hello"
          notesUpdatedAt={null}
          notesUpdatedBy={null}
          onSave={vi.fn()}
          isSaving={false}
          previewFirst
        />,
      )

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(2)
      expect(tabs[0]).toHaveAccessibleName('Preview')
      expect(tabs[1]).toHaveAccessibleName('Edit')
    })

    it('opens on the Preview tab (Preview selected, Edit not)', () => {
      render(
        <NotesEditor
          initialNotes="# Hello"
          notesUpdatedAt={null}
          notesUpdatedBy={null}
          onSave={vi.fn()}
          isSaving={false}
          previewFirst
        />,
      )

      expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute(
        'aria-selected',
        'false',
      )
    })

    it('keeps Edit fully functional: clicking Edit reveals the editable textarea', () => {
      render(
        <NotesEditor
          initialNotes="original body"
          notesUpdatedAt={null}
          notesUpdatedBy={null}
          onSave={vi.fn()}
          isSaving={false}
          previewFirst
        />,
      )

      // Activate the Edit tab. Radix Tabs triggers activate on mousedown
      // (left button), not on a bare click event.
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Edit' }))
      expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute(
        'aria-selected',
        'true',
      )

      // The textarea is visible and editable.
      const textarea = getTextarea()
      expect(textarea).toBeVisible()
      expect(textarea.value).toBe('original body')
      fireEvent.change(textarea, { target: { value: 'edited under previewFirst' } })
      expect(getTextarea().value).toBe('edited under previewFirst')
    })
  })
})
