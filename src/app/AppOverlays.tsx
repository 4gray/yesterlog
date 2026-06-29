import type { ComponentProps } from "react";
import { ReleaseNotesDialog } from "../components/ReleaseNotesDialog";
import { SnackbarStack } from "../components/SnackbarStack";
import { TimeEntryModalLayer } from "../components/TimeEntryModalLayer";

type TimeEntryModalLayerProps = ComponentProps<typeof TimeEntryModalLayer>;
type ReleaseNotesDialogProps = ComponentProps<typeof ReleaseNotesDialog>;
type SnackbarStackProps = ComponentProps<typeof SnackbarStack>;

export interface AppOverlaysProps extends TimeEntryModalLayerProps {
  releaseNotesDialogInfo?: ReleaseNotesDialogProps["updateInfo"];
  releaseHistory: ReleaseNotesDialogProps["releaseHistory"];
  isLoadingReleaseHistory: ReleaseNotesDialogProps["isLoadingReleaseHistory"];
  releaseHistoryError?: ReleaseNotesDialogProps["releaseHistoryError"];
  onCloseReleaseNotes: ReleaseNotesDialogProps["onClose"];
  onDownloadUpdate: ReleaseNotesDialogProps["onDownload"];
  onOpenReleasePage: ReleaseNotesDialogProps["onOpenReleasePage"];
  onSelectReleaseNotesVersion: ReleaseNotesDialogProps["onSelectRelease"];
  onRefreshReleaseHistory: ReleaseNotesDialogProps["onRefreshReleaseHistory"];
  notifications: SnackbarStackProps["notifications"];
  onDismissNotification: SnackbarStackProps["onDismiss"];
}

export const AppOverlays = ({
  releaseNotesDialogInfo,
  releaseHistory,
  isLoadingReleaseHistory,
  releaseHistoryError,
  onCloseReleaseNotes,
  onDownloadUpdate,
  onOpenReleasePage,
  onSelectReleaseNotesVersion,
  onRefreshReleaseHistory,
  notifications,
  onDismissNotification,
  ...timeEntryModalLayerProps
}: AppOverlaysProps) => (
  <>
    <TimeEntryModalLayer {...timeEntryModalLayerProps} />

    {releaseNotesDialogInfo && (
      <ReleaseNotesDialog
        updateInfo={releaseNotesDialogInfo}
        releaseHistory={releaseHistory}
        isLoadingReleaseHistory={isLoadingReleaseHistory}
        releaseHistoryError={releaseHistoryError}
        onClose={onCloseReleaseNotes}
        onDownload={onDownloadUpdate}
        onOpenReleasePage={onOpenReleasePage}
        onSelectRelease={onSelectReleaseNotesVersion}
        onRefreshReleaseHistory={onRefreshReleaseHistory}
      />
    )}

    <SnackbarStack notifications={notifications} onDismiss={onDismissNotification} />
  </>
);
