import React from 'react';
import { tokens } from '../tokens';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Element rendered inside the right edge of the field (e.g. show/hide password). */
  endAdornment?: React.ReactNode;
  'data-testid'?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  endAdornment,
  id,
  style,
  'data-testid': testId,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || props.name || generatedId;
  const messageId = `${inputId}-message`;
  const hasMessage = Boolean(error || helperText);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: tokens.typography.fontSize.xs,
            fontWeight: tokens.typography.fontWeight.semibold,
            color: tokens.colors.textPrimary,
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          id={inputId}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          style={{
            width: '100%',
            padding: '10px 14px',
            paddingRight: endAdornment ? '52px' : '14px',
            fontSize: tokens.typography.fontSize.sm,
            fontFamily: tokens.typography.fontFamily,
            borderRadius: tokens.radius.md,
            border: `1.5px solid ${error ? tokens.colors.status.cancelled : tokens.colors.border}`,
            backgroundColor: tokens.colors.surface,
            color: tokens.colors.textPrimary,
            minHeight: '44px',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease',
            ...style,
          }}
          {...props}
        />
        {endAdornment && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {endAdornment}
          </div>
        )}
      </div>
      {error && (
        <span id={messageId} style={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.status.cancelled }}>
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={messageId} style={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textSecondary }}>
          {helperText}
        </span>
      )}
    </div>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string | number; label: string }[];
  'data-testid'?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  children,
  id,
  style,
  'data-testid': testId,
  ...props
}) => {
  const generatedId = React.useId();
  const selectId = id || props.name || generatedId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && (
        <label
          htmlFor={selectId}
          style={{
            fontSize: tokens.typography.fontSize.xs,
            fontWeight: tokens.typography.fontWeight.semibold,
            color: tokens.colors.textPrimary,
          }}
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        data-testid={testId}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: tokens.typography.fontSize.sm,
          fontFamily: tokens.typography.fontFamily,
          borderRadius: tokens.radius.md,
          border: `1.5px solid ${error ? tokens.colors.status.cancelled : tokens.colors.border}`,
          backgroundColor: tokens.colors.surface,
          color: tokens.colors.textPrimary,
          minHeight: '44px',
          boxSizing: 'border-box',
          cursor: 'pointer',
          ...style,
        }}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error && (
        <span style={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.status.cancelled }}>
          {error}
        </span>
      )}
    </div>
  );
};

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  'data-testid'?: string;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  id,
  style,
  'data-testid': testId,
  ...props
}) => {
  const generatedId = React.useId();
  const textareaId = id || props.name || generatedId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && (
        <label
          htmlFor={textareaId}
          style={{
            fontSize: tokens.typography.fontSize.xs,
            fontWeight: tokens.typography.fontWeight.semibold,
            color: tokens.colors.textPrimary,
          }}
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        data-testid={testId}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: tokens.typography.fontSize.sm,
          fontFamily: tokens.typography.fontFamily,
          borderRadius: tokens.radius.md,
          border: `1.5px solid ${error ? tokens.colors.status.cancelled : tokens.colors.border}`,
          backgroundColor: tokens.colors.surface,
          color: tokens.colors.textPrimary,
          boxSizing: 'border-box',
          minHeight: '80px',
          resize: 'vertical',
          ...style,
        }}
        {...props}
      />
      {error && (
        <span style={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.status.cancelled }}>
          {error}
        </span>
      )}
    </div>
  );
};
