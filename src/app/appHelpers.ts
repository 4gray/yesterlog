import type {
  AppReleaseInfo,
  AppSettings,
  AppUpdateInfo,
  JiraTicket,
  PersonalNote,
  SyncResult,
  TicketSortMode
} from "../../shared/types";
import { GITHUB_RELEASES_URL } from "../../shared/releases";

export const isJiraConfigured = (settings: AppSettings) =>
  Boolean(settings.jiraBaseUrl.trim() && settings.jiraEmail.trim() && settings.jiraApiToken.trim());

export const normalizeJiraSiteInput = (rawSite: string) => {
  const trimmed = rawSite.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  const candidate = trimmed.includes("://")
    ? trimmed
    : `https://${trimmed.includes(".") ? trimmed : `${trimmed}.atlassian.net`}`;

  try {
    const url = new URL(candidate);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed;
  }
};

export const formatSyncTime = (syncResult?: SyncResult) => {
  if (!syncResult) {
    return "NOT SYNCED";
  }

  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
    .format(new Date(syncResult.syncedAt))
    .toUpperCase();
  return `SYNCED ${time}`;
};

export const formatReleaseVersion = (version?: string) => {
  const trimmed = version?.trim();
  return trimmed ? `v${trimmed.replace(/^v/i, "")}` : "unknown";
};

export const sortPersonalNotes = (notes: PersonalNote[]) =>
  [...notes].sort((a, b) => new Date(a.startedISO).getTime() - new Date(b.startedISO).getTime());

const getTicketCreatedTime = (ticket: JiraTicket) => {
  if (!ticket.createdAt) {
    return undefined;
  }

  const time = Date.parse(ticket.createdAt);
  return Number.isFinite(time) ? time : undefined;
};

export const compareTicketsByCreated = (sortMode: TicketSortMode) => {
  return (left: JiraTicket, right: JiraTicket) => {
    const leftTime = getTicketCreatedTime(left);
    const rightTime = getTicketCreatedTime(right);

    if (leftTime === undefined && rightTime === undefined) {
      return left.key.localeCompare(right.key);
    }

    if (leftTime === undefined) {
      return 1;
    }

    if (rightTime === undefined) {
      return -1;
    }

    return sortMode === "createdAsc"
      ? leftTime - rightTime || left.key.localeCompare(right.key)
      : rightTime - leftTime || left.key.localeCompare(right.key);
  };
};

export const updateVisiblePersonalNotes = (
  current: PersonalNote[],
  previousNote: PersonalNote,
  nextNote: PersonalNote,
  visibleWeekKey: string
) => {
  const withoutPrevious = current.filter((note) => note.id !== previousNote.id);
  if (nextNote.weekKey !== visibleWeekKey) {
    return sortPersonalNotes(withoutPrevious);
  }
  return sortPersonalNotes([...withoutPrevious, nextNote]);
};

const getPersonalNoteImportFingerprint = (note: PersonalNote) =>
  [note.dateKey, note.title?.trim() ?? "", note.text.trim(), note.timeSpentSeconds].join("\u0000");

export const mergeImportedPersonalNotes = (currentNotes: PersonalNote[], importedNotes: PersonalNote[]) => {
  const seen = new Set(currentNotes.map(getPersonalNoteImportFingerprint));
  const additions = importedNotes.filter((note) => {
    const fingerprint = getPersonalNoteImportFingerprint(note);
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });

  return {
    notes: sortPersonalNotes([...currentNotes, ...additions]),
    addedCount: additions.length
  };
};

export const groupPersonalNotesByWeek = (notes: PersonalNote[]) => {
  return notes.reduce<Map<string, PersonalNote[]>>((groups, note) => {
    const group = groups.get(note.weekKey) ?? [];
    group.push(note);
    groups.set(note.weekKey, group);
    return groups;
  }, new Map());
};

export const formatPersonalNoteCount = (count: number) => `${count} personal ${count === 1 ? "note" : "notes"}`;

export const createDemoUpdateInfo = (updateAvailable = false): AppUpdateInfo => {
  const latestVersion = updateAvailable ? "1.3.0" : "1.0.0";

  return {
    currentVersion: "1.0.0",
    latestVersion,
    releaseName: updateAvailable ? "TimeBro v1.3.0" : undefined,
    releaseNotes: updateAvailable
      ? "## Highlights\n\n- Added in-app release notes for update prompts.\n- Added direct platform downloads from GitHub release assets.\n- Kept the update snackbar visible while the notes dialog is open."
      : "Maintenance polish for the local preview build.",
    releasePageUrl: updateAvailable
      ? "https://github.com/4gray/time-bro/releases/tag/v1.3.0"
      : GITHUB_RELEASES_URL,
    downloadUrl: updateAvailable
      ? "https://github.com/4gray/time-bro/releases/download/v1.3.0/TimeBro-1.3.0-arm64.dmg"
      : undefined,
    downloadName: updateAvailable ? "TimeBro-1.3.0-arm64.dmg" : undefined,
    downloadPlatform: updateAvailable ? "macos" : undefined,
    publishedAt: updateAvailable ? "2026-06-24T09:00:00.000Z" : undefined,
    checkedAt: new Date().toISOString(),
    updateAvailable
  };
};

export const createDemoReleaseHistory = (updateAvailable = false): AppReleaseInfo[] => [
  {
    version: updateAvailable ? "1.3.0" : "1.0.0",
    releaseName: updateAvailable ? "TimeBro v1.3.0" : "TimeBro v1.0.0",
    releaseNotes: updateAvailable
      ? [
          "## Highlights",
          "",
          "- Added **markdown** release notes in the app.",
          "- Added direct platform downloads from GitHub release assets.",
          "- Kept screenshots at their natural size inside the release dialog.",
          "",
          "![Dark Today screenshot](screenshots/v1.4.0/dark-today.png)"
        ].join("\n")
      : [
          "## TimeBro v1.0.0",
          "",
          "- First stable desktop release.",
          "- Local Jira weekly time tracking with no backend server.",
          "- CSV export for weekly summaries."
        ].join("\n"),
    releasePageUrl: updateAvailable
      ? "https://github.com/4gray/time-bro/releases/tag/v1.3.0"
      : "https://github.com/4gray/time-bro/releases/tag/v1.0.0",
    downloadUrl: updateAvailable
      ? "https://github.com/4gray/time-bro/releases/download/v1.3.0/TimeBro-1.3.0-arm64.dmg"
      : undefined,
    downloadName: updateAvailable ? "TimeBro-1.3.0-arm64.dmg" : undefined,
    downloadPlatform: updateAvailable ? "macos" : undefined,
    publishedAt: updateAvailable ? "2026-06-24T09:00:00.000Z" : "2026-06-17T09:00:00.000Z"
  },
  ...(updateAvailable
    ? [
        {
          version: "1.2.0",
          releaseName: "TimeBro v1.2.0",
          releaseNotes: [
            "## Changed",
            "",
            "- Added Review view polish.",
            "- Improved ticket search feedback.",
            "- Tightened renderer screenshot checks."
          ].join("\n"),
          releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.2.0",
          publishedAt: "2026-06-21T09:00:00.000Z"
        },
        {
          version: "1.1.0",
          releaseName: "TimeBro v1.1.0",
          releaseNotes: [
            "## Fixed",
            "",
            "- Preserved worklog comments from Jira ADF.",
            "- Added safer update download links.",
            "- Improved settings copy for API tokens."
          ].join("\n"),
          releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
          publishedAt: "2026-06-19T09:00:00.000Z"
        },
        {
          version: "1.0.0",
          releaseName: "TimeBro v1.0.0",
          releaseNotes: [
            "## TimeBro v1.0.0",
            "",
            "- First stable desktop release.",
            "- Local Jira weekly time tracking with no backend server.",
            "- CSV export for weekly summaries."
          ].join("\n"),
          releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.0.0",
          publishedAt: "2026-06-17T09:00:00.000Z"
        }
      ]
    : [
        {
          version: "0.9.0",
          releaseName: "TimeBro v0.9.0",
          releaseNotes: [
            "## Beta",
            "",
            "- Added the first local settings flow.",
            "- Added Jira connection checks."
          ].join("\n"),
          releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v0.9.0",
          publishedAt: "2026-06-10T09:00:00.000Z"
        }
      ])
];
