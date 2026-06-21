import type { JiraEpicInfo } from "../../shared/types";

interface EpicPillProps {
  epic?: JiraEpicInfo;
  className?: string;
}

export const EpicPill = ({ epic, className }: EpicPillProps) => {
  if (!epic) {
    return null;
  }

  const label = epic.summary || epic.key;
  const content = (
    <>
      <span className="epic-diamond" />
      <span className="epic-label">{label}</span>
    </>
  );

  if (epic.url) {
    return (
      <a
        className={`epic-pill${className ? ` ${className}` : ""}`}
        href={epic.url}
        target="_blank"
        rel="noreferrer"
        title={`Epic: ${label}`}
        aria-label={`Epic: ${label}`}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={`epic-pill${className ? ` ${className}` : ""}`} title={`Epic: ${label}`} aria-label={`Epic: ${label}`}>
      {content}
    </span>
  );
};
