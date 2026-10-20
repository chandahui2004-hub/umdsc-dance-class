import React, { useState, useRef, useEffect, useId } from 'react';

export interface PixelDropdownOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
  hint?: string;
}

export interface PixelDropdownProps {
  options: PixelDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  className?: string;
  buttonClassName?: string;
  maxVisibleItems?: number;
}

export const PixelDropdown: React.FC<PixelDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  ariaLabel,
  id,
  className = '',
  buttonClassName = '',
  maxVisibleItems = 5
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const dropdownId = id || generatedId;

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (option: PixelDropdownOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
  };

  // 5 items roughly equals 200px (40px per item)
  const maxHeightStyle = { maxHeight: `${maxVisibleItems * 40}px` };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left font-mono ${className}`}
    >
      <button
        type="button"
        id={dropdownId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full min-h-[44px] px-3 py-2 flex items-center justify-between text-left font-mono text-sm border-2 border-[var(--outline)] bg-[var(--night-1)] text-[var(--text-1)] shadow-[2px_2px_0_var(--outline)] transition-colors focus:outline-none focus:border-[var(--neon-cyan)] ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-[var(--night-2)]'
            : 'cursor-pointer hover:border-[var(--neon-cyan)] active:translate-x-[1px] active:translate-y-[1px]'
        } ${buttonClassName}`}
      >
        <span className={`truncate ${!selectedOption ? 'text-[var(--text-3)]' : 'text-[var(--text-1)] font-medium'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span
          className="ml-2 shrink-0 font-mono text-xs text-[var(--neon-cyan)] transition-transform duration-100"
          aria-hidden="true"
        >
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-labelledby={dropdownId}
          style={maxHeightStyle}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-y-auto pixel-scrollbar bg-[var(--night-2)] border-2 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] divide-y divide-[var(--outline)] animate-in fade-in duration-75"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-[var(--text-3)] italic">
              No options available
            </div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option)}
                  className={`min-h-[38px] px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                    option.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-[var(--violet-2)] hover:text-[var(--neon-cyan)]'
                  } ${
                    isSelected
                      ? 'bg-[var(--violet-2)] text-[var(--neon-cyan)] font-bold'
                      : 'text-[var(--text-1)]'
                  }`}
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="truncate">{option.label}</span>
                    {option.hint && (
                      <span className="text-[10px] text-[var(--text-3)] truncate">
                        {option.hint}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <span className="shrink-0 text-xs text-[var(--neon-cyan)] font-bold pl-2" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
