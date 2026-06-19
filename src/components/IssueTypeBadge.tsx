import type { JiraIssueTypeInfo } from "../../shared/types";

interface IssueTypeBadgeProps {
  issueType?: JiraIssueTypeInfo;
  className?: string;
}

export const getIssueTypeBadgeLabel = (issueType?: JiraIssueTypeInfo) => {
  const normalizedName = issueType?.name?.trim().toLowerCase().replace(/[\s_-]+/g, "");

  if (issueType?.subtask || (issueType?.hierarchyLevel ?? 0) < 0 || normalizedName === "subtask") {
    return "SUB";
  }

  if (issueType?.hierarchyLevel === 1 || normalizedName === "epic") {
    return "EPIC";
  }

  return undefined;
};

export const IssueTypeBadge = ({ issueType, className }: IssueTypeBadgeProps) => {
  const label = getIssueTypeBadgeLabel(issueType);

  if (!label) {
    return null;
  }

  return (
    <span
      className={`issue-type-badge is-${label.toLowerCase()}${className ? ` ${className}` : ""}`}
      title={issueType?.name ? `Jira issue type: ${issueType.name}` : `Jira issue type: ${label}`}
      aria-label={issueType?.name ? `Jira issue type: ${issueType.name}` : `Jira issue type: ${label}`}
    >
      {label}
    </span>
  );
};
