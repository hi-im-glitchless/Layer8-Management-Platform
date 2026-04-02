import { useDroppable } from '@dnd-kit/core'
import { KanbanCard } from './KanbanCard'
import type { BoardCard, BoardStage } from '../types'

interface Props {
  stage: BoardStage
  label: string
  cards: BoardCard[]
  cardCount: number
  onCardClick?: (cardId: string) => void
}

export function KanbanColumn({ stage, label, cards, cardCount, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    data: { targetStage: stage },
  })

  return (
    <div className="w-80 flex-shrink-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 pb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </h3>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">
          {cardCount}
        </span>
      </div>

      {/* Droppable body */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto space-y-2 p-2 rounded-lg bg-muted/30 transition-all ${
          isOver ? 'ring-2 ring-primary/50' : ''
        }`}
      >
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No projects in this stage
          </p>
        ) : (
          cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onCardClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  )
}
