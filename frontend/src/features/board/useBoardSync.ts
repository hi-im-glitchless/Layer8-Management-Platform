import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? undefined : 'http://localhost:3001')

/** Resources the backend may emit on `board:invalidate`. */
type BoardInvalidateResource = 'cards' | 'comments' | 'files' | 'notifications'

export function useBoardSync(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = io(SOCKET_URL as string | undefined, {
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })

    socket.on('board:invalidate', ({ resource }: { resource: BoardInvalidateResource }) => {
      // The generic prefix invalidate refreshes any query whose key starts
      // with `['board', resource]` — for `'notifications'` this includes the
      // unread-count query (`['board','notifications','unread']`).
      queryClient.invalidateQueries({ queryKey: ['board', resource] })
    })

    socket.on('connect', () => {
      console.log('[BoardSync] Connected')
    })

    socket.on('disconnect', (reason: string) => {
      console.log('[BoardSync] Disconnected:', reason)
    })

    return () => {
      socket.disconnect()
    }
  }, [queryClient])
}
