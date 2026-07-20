export function Notice({ tone = 'error', children, onClose }: {
  tone?: 'error' | 'success' | 'info';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button type="button" aria-label="Cerrar mensaje" onClick={onClose}>×</button>}
    </div>
  );
}
