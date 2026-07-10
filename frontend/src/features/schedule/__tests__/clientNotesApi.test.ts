import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleApi } from '../api'

// Exercises the two Phase-02 client-notes api functions directly against a
// stubbed global.fetch (apiClient uses fetch under the hood — no React/hooks).
// The point of these tests is to pin the Phase-01 GET/PUT response-shape
// asymmetry: GET returns the notes object UNWRAPPED, PUT returns it WRAPPED in
// { client }. A future refactor that collapses one into the other must fail here.

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Pre-seed a CSRF cookie so ensureCsrfToken() short-circuits and does not
  // issue its own /api/csrf-token fetch on the PUT path.
  document.cookie = '__csrf=test-token'
  fetchMock = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as typeof fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scheduleApi client-notes GET/PUT response shapes', () => {
  it('getClientNotes issues a GET and returns the UNWRAPPED notes object as-is', async () => {
    const payload = {
      notes: '# hello',
      notesUpdatedAt: '2026-07-10T12:00:00.000Z',
      notesUpdatedBy: 'user-42',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    const result = await scheduleApi.getClientNotes('c1')

    // returned shape is unwrapped — no { client } envelope
    expect(result).toEqual(payload)
    expect((result as { client?: unknown }).client).toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/schedule/clients/c1/notes')
    // GET: no method supplied by the api function
    expect(options?.method).toBeUndefined()
  })

  it('updateClientNotes issues a PUT with a JSON { notes } body and returns the WRAPPED { client } shape', async () => {
    const wrapped = {
      client: {
        notes: 'updated',
        notesUpdatedAt: '2026-07-10T13:00:00.000Z',
        notesUpdatedBy: 'user-7',
      },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(wrapped))

    const result = await scheduleApi.updateClientNotes('c1', 'updated')

    // caller must be able to read .client — the envelope is intentional
    expect(result.client).toEqual(wrapped.client)
    expect(result.client.notes).toBe('updated')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/schedule/clients/c1/notes')
    expect(options?.method).toBe('PUT')
    expect(JSON.parse(options?.body as string)).toEqual({ notes: 'updated' })
  })
})
