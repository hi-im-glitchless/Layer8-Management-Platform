import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? undefined : 'http://localhost:3001')

export function useScheduleSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = io(SOCKET_URL as string, {
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })

    socket.on('schedule:invalidate', ({ resource }: { resource: string }) => {
      queryClient.invalidateQueries({ queryKey: ['schedule', resource] })
    })

    return () => { socket.disconnect() }
  }, [queryClient])
}
