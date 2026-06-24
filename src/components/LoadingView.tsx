const loadingViewStyle = { display: "grid", placeItems: "center" } as const;

export const LoadingView = () => (
  <div className="view" style={loadingViewStyle}>
    <span className="sync-label">{"LOADING\u2026"}</span>
  </div>
);
