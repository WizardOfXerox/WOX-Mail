import React, { forwardRef } from 'react';

/**
 * Styled input component with label and error display.
 */
const Input = forwardRef(function Input({
  label,
  error,
  type = 'text',
  className = '',
  ...props
}, ref) {
  return (
    <div className={`input-group ${error ? 'input-error' : ''} ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <input ref={ref} type={type} className="input-field" {...props} />
      {error && <span className="input-error-msg">{error}</span>}
    </div>
  );
});

export default Input;
