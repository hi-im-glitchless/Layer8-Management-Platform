import { useState, useRef, useCallback, useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Palette } from 'lucide-react'
import { COLOR_PALETTE } from '../constants'

interface ColorPaletteProps {
  selectedColor: string
  onColorSelect: (hex: string) => void
}

// ── Color conversion utilities ──

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function hexToHsl(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 70, 50]
  let r = parseInt(result[1], 16) / 255
  let g = parseInt(result[2], 16) / 255
  let b = parseInt(result[3], 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break
      case g: h = ((b - r) / d + 2) * 60; break
      case b: h = ((r - g) / d + 4) * 60; break
    }
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

// ── HSL Picker sub-component ──

function HslPicker({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(color))
  const [hexInput, setHexInput] = useState(color)
  const slAreaRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Sync when parent color changes (e.g. preset click)
  useEffect(() => {
    setHsl(hexToHsl(color))
    setHexInput(color)
  }, [color])

  const updateFromHsl = useCallback((h: number, s: number, l: number) => {
    const clamped: [number, number, number] = [
      Math.max(0, Math.min(360, h)),
      Math.max(0, Math.min(100, s)),
      Math.max(0, Math.min(100, l)),
    ]
    setHsl(clamped)
    const hex = hslToHex(clamped[0], clamped[1], clamped[2])
    setHexInput(hex)
    onChange(hex)
  }, [onChange])

  const handleHexChange = (val: string) => {
    setHexInput(val)
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      const [h, s, l] = hexToHsl(val)
      setHsl([h, s, l])
      onChange(val)
    }
  }

  // SL area interaction (saturation = X, lightness = Y inverted)
  const handleSlPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = slAreaRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    updateFromHsl(hsl[0], Math.round(x * 100), Math.round((1 - y) * 100))
  }, [hsl, updateFromHsl])

  const handleSlDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    handleSlPointer(e)
  }, [handleSlPointer])

  const handleSlMove = useCallback((e: React.PointerEvent) => {
    if (dragging.current) handleSlPointer(e)
  }, [handleSlPointer])

  const handleSlUp = useCallback(() => { dragging.current = false }, [])

  return (
    <div className="space-y-3">
      {/* Saturation / Lightness area */}
      <div
        ref={slAreaRef}
        className="relative w-full h-32 rounded-md cursor-crosshair border border-border"
        style={{
          background: `
            linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, hsl(${hsl[0]}, 100%, 50%))
          `,
        }}
        onPointerDown={handleSlDown}
        onPointerMove={handleSlMove}
        onPointerUp={handleSlUp}
      >
        {/* Thumb */}
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${hsl[1]}%`,
            top: `${100 - hsl[2]}%`,
            backgroundColor: hslToHex(hsl[0], hsl[1], hsl[2]),
          }}
        />
      </div>

      {/* Hue slider */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Hue</label>
        <input
          type="range"
          min={0}
          max={360}
          value={hsl[0]}
          onChange={(e) => updateFromHsl(parseInt(e.target.value), hsl[1], hsl[2])}
          className="w-full h-3 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-400 [&::-webkit-slider-thumb]:shadow-md"
          style={{
            background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
          }}
        />
      </div>

      {/* Hex input + preview */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-md border border-border shrink-0"
          style={{ backgroundColor: hslToHex(hsl[0], hsl[1], hsl[2]) }}
        />
        <Input
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          placeholder="#000000"
          className="h-8 font-mono text-xs w-[100px]"
          maxLength={7}
        />
      </div>
    </div>
  )
}

// ── Main ColorPalette component ──

export function ColorPalette({ selectedColor, onColorSelect }: ColorPaletteProps) {
  const [showCustom, setShowCustom] = useState(false)
  const isPreset = COLOR_PALETTE.some((c) => c.hex === selectedColor)

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Preset swatches */}
        <div className="grid grid-cols-8 gap-1.5 p-1">
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
                    onClick={() => {
                      onColorSelect(color.hex)
                      setShowCustom(false)
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{color.name}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Custom toggle */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={() => setShowCustom(!showCustom)}
        >
          <Palette className="mr-1.5 h-3.5 w-3.5" />
          {showCustom ? 'Hide custom picker' : 'Custom color'}
          {!isPreset && !showCustom && (
            <span
              className="ml-1.5 inline-block w-3 h-3 rounded-full border border-border"
              style={{ backgroundColor: selectedColor }}
            />
          )}
        </Button>

        {/* HSL picker */}
        {showCustom && (
          <div className="border rounded-md p-3">
            <HslPicker color={selectedColor} onChange={onColorSelect} />
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
