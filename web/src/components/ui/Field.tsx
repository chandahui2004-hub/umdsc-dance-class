import React from 'react';

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helper?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  error,
  helper,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label
        htmlFor={inputId}
        className="font-display text-xs text-[var(--c-ink)] tracking-wider uppercase"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full min-h-[44px] px-3 py-2 bg-[var(--c-panel)] text-[var(--c-ink)] border-4 border-[var(--c-ink)] font-body text-base shadow-[2px_2px_0_var(--c-ink)] focus:outline-none focus:border-[var(--c-navy)] disabled:bg-[var(--c-grey)] disabled:opacity-75 ${
          error ? 'border-[var(--c-red)] bg-[var(--c-peach)]' : ''
        } ${className}`}
        {...props}
      />
      {error && (
        <span className="font-body text-xs text-[var(--c-red)] font-bold">
          {error}
        </span>
      )}
      {!error && helper && (
        <span className="font-body text-xs text-[var(--c-darkgrey)]">
          {helper}
        </span>
      )}
    </div>
  );
};
