import type { ComponentProps } from "react";
import { ReleaseNotesDialog } from "../components/ReleaseNotesDialog";
import { SnackbarStack } from "../components/SnackbarStack";
import { TimeEntryModalLayer } from "../components/TimeEntryModalLayer";

type TimeEntryModalLayerProps = ComponentProps<typeof TimeEntryModalLayer>;
type ReleaseNotesDialogProps = ComponentProps<typeof ReleaseNotesDialog>;
type SnackbarStackProps = ComponentProps<typeof SnackbarStack>;

export interface AppOverlaysProps extends TimeEntryModalLayerProps {
  releaseNotesDialogInfo?: ReleaseNotesDialogProps["updateInfo"];
  onCloseReleaseNotes: ReleaseNotesDialogProps["onClose"];
  onDownloadUpdate: ReleaseNotesDialogProps["onDownload"];
  onOpenReleasePage: ReleaseNotesDialogProps["onOpenReleasePage"];
  notifications: SnackbarStackProps["notifications"];
  onDismissNotification: SnackbarStackProps["onDismiss"];
}

export const AppOverlays = ({
  releaseNotesDialogInfo,
  onCloseReleaseNotes,
  onDownloadUpdate,
  onOpenReleasePage,
  notifications,
  onDismissNotification,
  ...timeEntryModalLayerProps
}: AppOverlaysProps) => (
  <>
    <TimeEntryModalLayer {...timeEntryModalLayerProps} />

    {releaseNotesDialogInfo && (
      <ReleaseNotesDialog
        updateInfo={releaseNotesDialogInfo}
        onClose={onCloseReleaseNotes}
        onDownload={onDownloadUpdate}
        onOpenReleasePage={onOpenReleasePage}
      />
    )}

    <SnackbarStack notifications={notifications} onDismiss={onDismissNotification} />
  </>
);
