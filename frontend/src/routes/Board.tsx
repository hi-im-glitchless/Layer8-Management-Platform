import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useAuth } from '@/features/auth/hooks'
import {
  useBoardCards,
  useMoveCard,
  useAutoMoveCards,
  useResetAutoMove,
} from '@/features/board/hooks'
import { useBoardSync } from '@/features/board/useBoardSync'
import { BOARD_STAGES, STAGE_LABELS, groupCardsByStage } from '@/features/board/types'
import type { BoardCard, BoardStage } from '@/features/board/types'
import { KanbanColumn } from '@/features/board/components/KanbanColumn'
import { KanbanCard, findCardById } from '@/features/board/components/KanbanCard'
import { BoardFilters } from '@/features/board/components/BoardFilters'
import { CardDetailModal } from '@/features/board/components/CardDetailModal'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export function Board() {
  const { user, role, isLoading: authLoading } = useAuth()
  useBoardSync()

  const { data, isLoading, isError, error, refetch } = useBoardCards()
  const cards = data?.cards

  const moveCardMutation = useMoveCard()
  const autoMoveMutation = useAutoMoveCards()
  const resetAutoMoveMutation = useResetAutoMove()

  // ── DnD state ──────────────────────────────────────────────────────
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // ── Filter state ───────────────────────────────────────────────────
  // Phase 24-05: role-aware default. NORMAL (pentesters) default to "mine",
  // PM/ADMIN default to "all". Initial value derives from useAuth().role
  // which falls back to 'NORMAL' while the auth query is still loading
  // (auth/hooks.ts:29) — a useEffect below re-derives the default once
  // isLoading flips false, covering the brief loading-default-NORMAL window.
  const [filterMode, setFilterMode] = useState<'mine' | 'all'>(
    role === 'NORMAL' ? 'mine' : 'all',
  )
  const [filterClientId, setFilterClientId] = useState<string | null>(null)
  const [filterPentesterId, setFilterPentesterId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Re-derive the default filter once auth finishes loading. We deliberately
  // re-set the filter only when the auth state transitions, NOT every render —
  // hence the eslint-disable below. Users can still toggle the filter
  // manually after this fires; we just want the initial default to reflect
  // the resolved role rather than the loading-fallback 'NORMAL'.
  useEffect(() => {
    if (!authLoading) {
      setFilterMode(role === 'NORMAL' ? 'mine' : 'all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, role])

  // ── Modal state (driven by ?card=<id> URL search param) ────────────
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCardId = searchParams.get('card') ?? null
  const setSelectedCardId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id === null) next.delete('card')
          else next.set('card', id)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // ── Sensors ────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // ── Auto-move on page load ─────────────────────────────────────────
  useEffect(() => {
    if (cards && autoMoveMutation.isIdle && !isDragging) {
      autoMoveMutation.mutate(undefined, {
        onError: () => {
          // 403 for non-PM users is expected — suppress silently
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards !== undefined])

  // ── Extract filter options from cards ──────────────────────────────
  // Phase 24-R03: cards now carry a `project` + an `assignments` list (one
  // entry per pentester/week sharing this Project). Pentester and client
  // filters source from those structures.
  const pentesters = useMemo(() => {
    if (!cards) return []
    const map = new Map<string, string>()
    for (const card of cards) {
      for (const a of card.assignments) {
        const name =
          a.teamMember?.displayName ??
          a.teamMember?.user?.displayName ??
          a.teamMember?.user?.username ??
          a.teamMemberId
        map.set(a.teamMemberId, name)
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [cards])

  const clients = useMemo(() => {
    if (!cards) return []
    const map = new Map<string, string>()
    for (const card of cards) {
      if (card.project.client) {
        map.set(card.project.client.id, card.project.client.name)
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [cards])

  // ── Client-side filtering ──────────────────────────────────────────
  const filteredCards = useMemo(() => {
    if (!cards) return []
    let result = cards as BoardCard[]

    if (filterMode === 'mine' && user) {
      result = result.filter((card) =>
        card.assignments.some((a) => a.teamMember?.userId === user.id),
      )
    }

    if (filterPentesterId) {
      result = result.filter((card) =>
        card.assignments.some((a) => a.teamMemberId === filterPentesterId),
      )
    }

    if (filterClientId) {
      result = result.filter((card) => card.project.clientId === filterClientId)
    }

    if (!showArchived) {
      result = result.filter((card) => card.stage !== 'archived')
    }

    return result
  }, [cards, filterMode, filterClientId, filterPentesterId, showArchived, user])

  // ── Group filtered cards by stage ──────────────────────────────────
  const cardsByStage = useMemo(
    () => groupCardsByStage(filteredCards),
    [filteredCards],
  )

  // ── Visible stages (include archived column when toggle is on) ─────
  const visibleStages = useMemo(() => {
    if (showArchived) {
      return [...BOARD_STAGES, 'archived' as const] as BoardStage[]
    }
    return BOARD_STAGES as readonly string[] as BoardStage[]
  }, [showArchived])

  // ── DnD handlers ───────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
    setIsDragging(true)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null)
      setIsDragging(false)

      const { active, over } = event
      if (!over) return

      const cardId = active.data.current?.cardId as string | undefined
      const sourceStage = active.data.current?.sourceStage as string | undefined
      const targetStage = over.data.current?.targetStage as string | undefined

      if (!cardId || !targetStage || sourceStage === targetStage) return

      moveCardMutation.mutate({ id: cardId, stage: targetStage })
    },
    [moveCardMutation],
  )

  // ── Card click handler ─────────────────────────────────────────────
  const handleCardClick = useCallback((cardId: string) => {
    setSelectedCardId(cardId)
  }, [])

  // ── Reset auto-move handler ────────────────────────────────────────
  const handleResetAutoMove = useCallback(
    (cardId: string) => {
      resetAutoMoveMutation.mutate(cardId)
    },
    [resetAutoMoveMutation],
  )

  // ── Active drag card for overlay ───────────────────────────────────
  const activeCard = useMemo(() => {
    if (!activeDragId || !cards) return null
    return findCardById(cards, activeDragId) ?? null
  }, [activeDragId, cards])

  // ── Error state ────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Planner</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">
            Failed to load planner
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {error?.message ?? 'An unexpected error occurred'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Planner</h1>
        <div className="flex items-center gap-2">
          <BoardFilters
            filterMode={filterMode}
            setFilterMode={setFilterMode}
            filterClientId={filterClientId}
            setFilterClientId={setFilterClientId}
            filterPentesterId={filterPentesterId}
            setFilterPentesterId={setFilterPentesterId}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            clients={clients}
            pentesters={pentesters}
          />
        </div>
      </div>

      {/* Board columns with DnD */}
      <div className="-mx-6 px-6 overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          autoScroll={{ threshold: { x: 0.2, y: 0 } }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 min-w-max pb-4">
            {isLoading
              ? BOARD_STAGES.map((stage) => (
                  <div key={stage} className="w-80 shrink-0 space-y-3">
                    <div className="flex items-center gap-2 px-2 pb-3">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-8 rounded-full" />
                    </div>
                    <div className="space-y-2 p-2">
                      <Skeleton className="h-20 w-full rounded-lg" />
                      <Skeleton className="h-20 w-full rounded-lg" />
                      <Skeleton className="h-20 w-full rounded-lg" />
                    </div>
                  </div>
                ))
              : visibleStages.map((stage) => (
                  <KanbanColumn
                    key={stage}
                    stage={stage}
                    label={STAGE_LABELS[stage]}
                    cards={cardsByStage[stage] ?? []}
                    cardCount={cardsByStage[stage]?.length ?? 0}
                    onCardClick={handleCardClick}
                  />
                ))}
          </div>

          {/* Drag overlay ghost. dropAnimation={null}: the card is moved
              optimistically by useMoveCard.onMutate, so the default drop
              animation (which tweens the ghost back to the source position)
              produced a visible "snap back to origin, then jump to target"
              glitch on cross-column drops. Disabling it lets the ghost vanish
              on release while the optimistic re-render already shows the card
              in the target column. */}
          <DragOverlay dropAnimation={null}>
            {activeCard ? (
              <div className="w-80">
                <KanbanCard card={activeCard} isDragOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Empty state */}
      {!isLoading && cards && filteredCards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No planner cards found. Cards are created when projects are added to the planner.
          </p>
        </div>
      )}

      {/* Card detail modal */}
      <CardDetailModal
        cardId={selectedCardId}
        open={selectedCardId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCardId(null)
        }}
        onResetAutoMove={handleResetAutoMove}
      />
    </div>
  )
}
