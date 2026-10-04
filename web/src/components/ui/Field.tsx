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
        className="font-display text-[10px] text-[var(--text-2)] tracking-wider uppercase"
      >
        {label}
      </label>
      {children ? (
        children
      ) : (
        <input
          id={inputId}
          className={`w-full min-h-[44px] px-3 py-2 px-well text-[16px] font-body text-[var(--text-1)] placeholder:text-[var(--text-3)] disabled:opacity-50 ${
            error ? 'border-[var(--neon-red)]' : ''
          } ${className}`}
          {...props}
        />
      )}
      {error && (
        <span className="font-body text-[14px] text-[var(--neon-red)] font-bold">
          {error}
        </span>
      )}
      {!error && helpText && (
        <span className="font-body text-[14px] text-[var(--text-2)]">
          {helpText}
        </span>
      )}
    </div>
  );
};
