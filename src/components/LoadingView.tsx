import { Loader2 } from "lucide-react";

export const LoadingView = () => (
  <div className="view loading-view" role="status" aria-label="Loading">
    <Loader2 className="spin" size={20} strokeWidth={1.9} />
    <span className="loading-view-label">{"LOADING…"}</span>
  </div>
);
