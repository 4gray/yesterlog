import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import type { JiraEpicInfo, JiraIssueTypeInfo } from "../../shared/types";
import { EpicPill } from "./EpicPill";
import { IssueTypeBadge } from "./IssueTypeBadge";

interface TicketKeyLinkProps {
  issueKey: string;
  url?: string;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
  showEpic?: boolean;
  keyClassName?: string;
  className?: string;
  style?: CSSProperties;
}

export const TicketKeyLink = ({
  issueKey,
  url,
  issueType,
  epic,
  showEpic = false,
  keyClassName,
  className,
  style
}: TicketKeyLinkProps) => (
  <span className={`ticket-key-inline${className ? ` ${className}` : ""}`}>
    <span className={keyClassName} style={style}>
      {issueKey}
    </span>
    {url ? (
      <a
        className="ticket-jira-link"
        href={url}
        target="_blank"
        rel="noreferrer"
        title={`Open ${issueKey} in Jira`}
        aria-label={`Open ${issueKey} in Jira`}
        onClick={(event) => event.stopPropagation()}
      >
        <ExternalLink size={13} strokeWidth={2} />
      </a>
    ) : null}
    <IssueTypeBadge issueType={issueType} />
    {showEpic && <EpicPill epic={epic} />}
  </span>
);
