import type { Server } from 'socket.io'

let _io: Server | null = null

export function initSocket(io: Server): void {
  _io = io
}

export function getIO(): Server | null {
  return _io
}

export function emitScheduleInvalidate(resource: 'assignments' | 'absences' | 'holidays' | 'team-members'): void {
  _io?.emit('schedule:invalidate', { resource })
}
