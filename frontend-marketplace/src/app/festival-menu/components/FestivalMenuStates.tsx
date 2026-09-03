type FestivalMenuErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function FestivalMenuErrorState({ message, onRetry }: FestivalMenuErrorStateProps) {
  return (
    <div className="festival-menu-state" role="alert">
      <p className="festival-menu-state-title">Menu temporarily unavailable</p>
      <p className="festival-menu-state-body">{message}</p>
      <button type="button" className="festival-menu-retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function FestivalMenuEmptyState() {
  return (
    <div className="festival-menu-state" role="status">
      <p className="festival-menu-state-title">Menu coming soon</p>
      <p className="festival-menu-state-body">
        Our festival menu is being prepared. Please check back shortly or ask at
        the counter.
      </p>
    </div>
  );
}
