import React, { useState, useEffect } from 'react';

export interface SwatchOption {
  key: string;
  label: string;
  css: string;
  isCustom?: boolean;
}

export const DEFAULT_SWATCHES: SwatchOption[] = [
  { key: 'green', label: 'GREEN', css: 'var(--c-green)' },
  { key: 'blue', label: 'BLUE', css: 'var(--c-blue)' },
  { key: 'orange', label: 'ORANGE', css: 'var(--c-orange)' },
  { key: 'pink', label: 'PINK', css: 'var(--c-pink)' },
  { key: 'yellow', label: 'YELLOW', css: 'var(--c-yellow)' },
  { key: 'lavender', label: 'LAVENDER', css: 'var(--c-lavender)' },
  { key: 'peach', label: 'PEACH', css: 'var(--c-peach)' },
  { key: 'darkgreen', label: 'DARK GREEN', css: 'var(--c-darkgreen)' }
];

const CUSTOM_COLORS_STORAGE_KEY = 'umdsc:custom-swatch-colors';

function loadCustomColors(): SwatchOption[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list.map((item: any) => ({
        key: item.key || item.css,
        label: item.label || item.key,
        css: item.css || item.key,
        isCustom: true
      }));
    }
  } catch {
    // fallback
  }
  return [];
}

function saveCustomColors(colors: SwatchOption[]) {
  try {
    localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // ignore
  }
}

export interface ColorSwatchPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export const ColorSwatchPicker: React.FC<ColorSwatchPickerProps> = ({
  value,
  onChange,
  label = 'COLOR SWATCH'
}) => {
  const [customColors, setCustomColors] = useState<SwatchOption[]>(loadCustomColors);
  const [isAdding, setIsAdding] = useState(false);
  const [newHex, setNewHex] = useState('#FF5500');
  const [hexError, setHexError] = useState<string | null>(null);

  useEffect(() => {
    saveCustomColors(customColors);
  }, [customColors]);

  const allSwatches = [...DEFAULT_SWATCHES, ...customColors];

  const handleAddColor = () => {
    let hex = newHex.trim();
    if (!hex.startsWith('#')) {
      hex = '#' + hex;
    }
    const isValidHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
    if (!isValidHex) {
      setHexError('Please enter a valid hex code (e.g. #FF5500 or #F50)');
      return;
    }

    const upperHex = hex.toUpperCase();
    const existing = allSwatches.find(
      (s) => s.key.toLowerCase() === upperHex.toLowerCase() || s.css.toLowerCase() === upperHex.toLowerCase()
    );

    if (existing) {
      onChange(existing.key);
      setIsAdding(false);
      setHexError(null);
      return;
    }

    const newOption: SwatchOption = {
      key: upperHex,
      label: upperHex,
      css: upperHex,
      isCustom: true
    };

    setCustomColors((prev) => [...prev, newOption]);
    onChange(upperHex);
    setIsAdding(false);
    setHexError(null);
  };

  const handleRemoveCustomColor = (e: React.MouseEvent, colorKey: string) => {
    e.stopPropagation();
    setCustomColors((prev) => prev.filter((c) => c.key !== colorKey));
    if (value === colorKey) {
      onChange(DEFAULT_SWATCHES[0].key);
    }
  };

  // Helper to determine active match
  const isSelected = (swatch: SwatchOption) => {
    if (value === swatch.key) return true;
    if (value.toLowerCase() === swatch.css.toLowerCase()) return true;
    return false;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="font-display text-[10px] uppercase tracking-wider text-[var(--text-1)]">
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            setIsAdding((prev) => !prev);
            setHexError(null);
          }}
          className="font-display text-[10px] text-[var(--neon-cyan)] hover:underline flex items-center gap-1 cursor-pointer"
        >
          {isAdding ? '▲ CLOSE' : '+ ADD NEW COLOR'}
        </button>
      </div>

      {/* Add New Color Form */}
      {isAdding && (
        <div className="p-3 px-panel border-2 border-dashed border-[var(--violet-4)] space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={newHex.startsWith('#') && newHex.length === 7 ? newHex : '#FF5500'}
              onChange={(e) => {
                setNewHex(e.target.value.toUpperCase());
                setHexError(null);
              }}
              className="w-10 h-10 border-2 border-[var(--outline)] cursor-pointer bg-transparent p-0"
              title="Pick color"
            />
            <input
              type="text"
              value={newHex}
              onChange={(e) => {
                setNewHex(e.target.value);
                setHexError(null);
              }}
              placeholder="#FF5500"
              className="w-32 min-h-[38px] px-2.5 font-mono text-sm px-well"
            />
            <button
              type="button"
              onClick={handleAddColor}
              className="px-3 min-h-[38px] bg-[var(--neon-pink)] text-[var(--on-neon)] font-display text-[10px] font-bold border-2 border-[var(--outline)] hover:brightness-110 active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
            >
              SAVE COLOR
            </button>
          </div>
          {hexError && (
            <p className="font-body text-xs text-[var(--neon-red)] font-bold">{hexError}</p>
          )}
          <p className="font-body text-[10px] text-[var(--text-2)]">
            Insert any hex color code (e.g. #FF5722, #9C27B0). Custom colors can be removed anytime.
          </p>
        </div>
      )}

      {/* Swatch Buttons Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {allSwatches.map((c) => {
          const selected = isSelected(c);
          return (
            <div key={c.key} className="relative group">
              <button
                type="button"
                onClick={() => onChange(c.key)}
                className={`w-full min-h-[44px] p-2 border-2 flex items-center justify-between gap-2 cursor-pointer transition-all ${
                  selected
                    ? 'px-panel px-neon border-[var(--outline)] font-bold'
                    : 'px-panel border-[var(--outline)]/50 opacity-75 hover:opacity-100'
                }`}
                style={selected ? ({ ['--glow' as any]: c.css } as React.CSSProperties) : undefined}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div
                    className="w-8 h-8 border-2 border-[var(--outline)] shrink-0"
                    style={{ backgroundColor: c.css }}
                  />
                  <span className="font-mono text-xs truncate text-[var(--text-1)]">{c.label}</span>
                </div>
                {selected && (
                  <span className="text-[10px] font-display text-[var(--text-1)]">✓</span>
                )}
              </button>

              {/* Remove button for custom colors */}
              {c.isCustom && (
                <button
                  type="button"
                  onClick={(e) => handleRemoveCustomColor(e, c.key)}
                  title={`Remove ${c.label}`}
                  aria-label={`Remove color ${c.label}`}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--neon-red)] text-[var(--on-neon)] font-display text-[10px] flex items-center justify-center border border-[var(--outline)] shadow-[1px_1px_0_var(--outline)] hover:brightness-110 active:scale-95 cursor-pointer z-10"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
