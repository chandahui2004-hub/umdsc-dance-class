import React from 'react';

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helper?: string;
  hint?: string;
  children?: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  label,
  error,
  helper,
  hint,
  id,
  className = '',
  children,
  ...props
}) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
  const helpText = helper || hint;

  return (
    <div className="flex flex-col gap-2 w-full">
      <label
        htmlFor={inputId}
        className="font-display text-xs text-[var(--text-1)] tracking-wider uppercase"
      >
        {label}
      </label>
      {children ? (
        children
      ) : (
        <input
          id={inputId}
          className={`w-full min-h-[44px] px-3 py-2 bg-[var(--c-panel)] text-[var(--text-1)] border-4 border-[var(--c-ink)] font-body text-base shadow-[2px_2px_0_var(--c-ink)] focus:outline-none focus:border-[var(--c-navy)] disabled:bg-[var(--c-grey)] disabled:opacity-75 ${
            error ? 'border-[var(--c-red)] bg-[var(--c-peach)]' : ''
          } ${className}`}
          {...props}
        />
      )}
      {error && (
        <span className="font-body text-xs text-[var(--c-red)] font-bold">
          {error}
        </span>
      )}
      {!error && helpText && (
        <span className="font-body text-xs text-[var(--text-2)]">
          {helpText}
        </span>
      )}
    </div>
  );
};
