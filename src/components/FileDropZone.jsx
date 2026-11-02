import { useState } from 'react';
import './FileDropZone.css';

function hasFiles(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes('Files');
}

// Wraps any upload UI so files can also be dropped on it. The click-to-choose
// button stays with the caller; this only adds the drop target and highlight, so
// every upload on the site behaves the same. Without `multiple` only the first
// dropped file is passed on.
export default function FileDropZone({
  onFiles,
  multiple = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      {...rest}
      className={`file-drop-zone${dragOver ? ' is-dragover' : ''}${className ? ` ${className}` : ''}`}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      {children}
    </div>
  );
}
