import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import type { JiraEpicInfo, JiraIssueTypeInfo } from "../../shared/types";
import { EpicPill } from "./EpicPill";
import { IssueTypeBadge } from "./IssueTypeBadge";
import { useTicketDetailsLauncher } from "./TicketDetailsContext";

interface TicketKeyLinkProps {
  issueKey: string;
  url?: string;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
  showEpic?: boolean;
  showJiraLink?: boolean;
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
  showJiraLink = true,
  keyClassName,
  className,
  style
}: TicketKeyLinkProps) => {
  const openTicketDetails = useTicketDetailsLauncher();

  return (
    <span className={`ticket-key-inline${className ? ` ${className}` : ""}`}>
      {openTicketDetails ? (
        <button
          type="button"
          className={`ticket-key-button${keyClassName ? ` ${keyClassName}` : ""}`}
          style={style}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openTicketDetails(issueKey);
          }}
          title={`Show ${issueKey} details`}
          aria-label={`Show ${issueKey} details`}
        >
          {issueKey}
        </button>
      ) : (
        <span className={keyClassName} style={style}>
          {issueKey}
        </span>
      )}
      {url && showJiraLink ? (
        <a
          className="ticket-jira-link"
          href={url}
          target="_blank"
          rel="noreferrer"
          draggable={false}
          title={`Open ${issueKey} in Jira`}
          aria-label={`Open ${issueKey} in Jira`}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink size={13} strokeWidth={2} />
        </a>
      ) : null}
      <IssueTypeBadge issueType={issueType} />
      {showEpic && <EpicPill epic={epic} />}
    </span>
  );
};
