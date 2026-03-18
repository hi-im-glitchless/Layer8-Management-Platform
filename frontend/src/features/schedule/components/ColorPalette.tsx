import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { COLOR_PALETTE } from '../constants'

interface ColorPaletteProps {
  selectedColor: string
  onColorSelect: (hex: string) => void
}

export function ColorPalette({ selectedColor, onColorSelect }: ColorPaletteProps) {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-6 gap-2">
        {COLOR_PALETTE.map((color) => {
          const isSelected = selectedColor === color.hex
          return (
            <Tooltip key={color.hex}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`w-7 h-7 rounded-md transition-all ${
                    isSelected
                      ? 'ring-2 ring-ring ring-offset-2 ring-offset-background scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  onClick={() => onColorSelect(color.hex)}
                />
              </TooltipTrigger>
              <TooltipContent side="top">{color.name}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
