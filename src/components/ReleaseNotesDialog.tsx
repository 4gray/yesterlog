import { Download, ExternalLink, FileText, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { normalizeReleaseVersion } from "../../shared/releases";
import type { AppReleaseInfo, AppUpdateInfo } from "../../shared/types";
import { ReleaseNotesMarkdown } from "./ReleaseNotesMarkdown";

interface ReleaseNotesDialogProps {
  updateInfo: AppUpdateInfo;
  releaseHistory: AppReleaseInfo[];
  isLoadingReleaseHistory: boolean;
  releaseHistoryError?: string;
  onClose: () => void;
  onDownload: (info: AppUpdateInfo) => void;
  onOpenReleasePage: (url?: string) => void;
  onSelectRelease: (release: AppReleaseInfo) => void;
  onRefreshReleaseHistory: () => void;
}

const formatReleaseVersion = (version?: string) => {
  const trimmed = version?.trim();
  return trimmed ? `v${trimmed.replace(/^v/i, "")}` : "unknown";
};

const formatPublishedAt = (publishedAt?: string) => {
  if (!publishedAt) {
    return "Release date unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(publishedAt));
};

const releaseFromUpdateInfo = (info: AppUpdateInfo): AppReleaseInfo | undefined => {
  if (!info.latestVersion) {
    return undefined;
  }

  return {
    version: info.latestVersion,
    releaseName: info.releaseName,
    releaseNotes: info.releaseNotes,
    releasePageUrl: info.releasePageUrl,
    downloadUrl: info.downloadUrl,
    downloadName: info.downloadName,
    downloadPlatform: info.downloadPlatform,
    publishedAt: info.publishedAt
  };
};

export const ReleaseNotesDialog = ({
  updateInfo,
  releaseHistory,
  isLoadingReleaseHistory,
  releaseHistoryError,
  onClose,
  onDownload,
  onOpenReleasePage,
  onSelectRelease,
  onRefreshReleaseHistory
}: ReleaseNotesDialogProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const releaseVersions = useMemo(() => {
    const selectedRelease = releaseFromUpdateInfo(updateInfo);
    const byVersion = new Map<string, AppReleaseInfo>();

    for (const release of releaseHistory) {
      if (!release?.version) {
        continue;
      }
      const key = normalizeReleaseVersion(release.version);
      if (!byVersion.has(key)) {
        byVersion.set(key, release);
      }
    }

    if (selectedRelease?.version) {
      const selectedKey = normalizeReleaseVersion(selectedRelease.version);
      if (!byVersion.has(selectedKey)) {
        byVersion.set(selectedKey, selectedRelease);
      }
    }

    return [...byVersion.values()];
  }, [releaseHistory, updateInfo]);

  const notes = updateInfo.releaseNotes?.trim() || "No release notes were published for this release.";
  const releaseTitle = updateInfo.releaseName?.trim() || `TimeBro ${formatReleaseVersion(updateInfo.latestVersion)}`;
  const selectedVersion = normalizeReleaseVersion(updateInfo.latestVersion ?? "");
  const canDownload = Boolean(updateInfo.updateAvailable && (updateInfo.downloadUrl || updateInfo.autoUpdate?.supported));
  const downloadLabel = updateInfo.autoUpdate?.supported
    ? updateInfo.autoUpdate.phase === "downloaded"
      ? "Restart"
      : "Download update"
    : "Download";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Release notes">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel release-notes-panel">
        <div className="modal-head">
          <div className="modal-title-row">
            <span className="modal-title">Release notes</span>
            <span className="modal-day">{formatReleaseVersion(updateInfo.latestVersion)}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close release notes">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body release-notes-body">
          <aside className="release-notes-versions" aria-label="Release versions">
            <div className="release-notes-version-heading">
              <span>Versions</span>
              {isLoadingReleaseHistory ? <Loader2 className="spin" size={13} /> : null}
            </div>
            <div className="release-notes-version-list">
              {releaseVersions.map((release) => {
                const version = normalizeReleaseVersion(release.version);
                const isSelected = version === selectedVersion;
                return (
                  <button
                    key={version}
                    type="button"
                    className={isSelected ? "active" : undefined}
                    aria-pressed={isSelected}
                    onClick={() => onSelectRelease(release)}
                  >
                    <strong>{formatReleaseVersion(release.version)}</strong>
                    <span>{release.releaseName?.trim() || formatPublishedAt(release.publishedAt)}</span>
                  </button>
                );
              })}
            </div>
            {releaseHistoryError ? (
              <button type="button" className="release-notes-retry" onClick={onRefreshReleaseHistory}>
                <RefreshCw size={13} />
                Retry
              </button>
            ) : null}
          </aside>

          <section className="release-notes-content">
            <div className="release-notes-meta">
              <FileText size={17} />
              <div>
                <strong>{releaseTitle}</strong>
                <span>{formatPublishedAt(updateInfo.publishedAt)}</span>
              </div>
            </div>
            <ReleaseNotesMarkdown markdown={notes} />
          </section>
        </div>

        <div className="modal-foot">
          <span className="modal-foot-hint">{updateInfo.downloadName ?? "GitHub release"}</span>
          <div className="modal-foot-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              Done
            </button>
            <button type="button" className="secondary-button" onClick={() => onOpenReleasePage(updateInfo.releasePageUrl)}>
              <ExternalLink size={16} />
              GitHub
            </button>
            {canDownload ? (
              <button type="button" className="primary-button" onClick={() => onDownload(updateInfo)}>
                {updateInfo.autoUpdate?.phase === "downloaded" ? <RefreshCw size={16} /> : <Download size={16} />}
                {downloadLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
