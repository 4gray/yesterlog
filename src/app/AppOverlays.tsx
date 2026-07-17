import type { ComponentProps } from "react";
import { CommandPalette } from "../components/CommandPalette";
import { ReleaseNotesDialog } from "../components/ReleaseNotesDialog";
import { SnackbarStack } from "../components/SnackbarStack";
import { TicketDetailsDialog } from "../components/TicketDetailsDialog";
import { TimeEntryModalLayer } from "../components/TimeEntryModalLayer";

type TimeEntryModalLayerProps = ComponentProps<typeof TimeEntryModalLayer>;
type ReleaseNotesDialogProps = ComponentProps<typeof ReleaseNotesDialog>;
type TicketDetailsDialogProps = ComponentProps<typeof TicketDetailsDialog>;
type SnackbarStackProps = ComponentProps<typeof SnackbarStack>;
type CommandPaletteProps = ComponentProps<typeof CommandPalette>;

export interface AppOverlaysProps extends TimeEntryModalLayerProps {
  commandPaletteOpen: CommandPaletteProps["open"];
  commands: CommandPaletteProps["commands"];
  onCloseCommandPalette: CommandPaletteProps["onClose"];
  ticketDetailsDialog?: Omit<TicketDetailsDialogProps, "onClose">;
  onCloseTicketDetails?: TicketDetailsDialogProps["onClose"];
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
  commandPaletteOpen,
  commands,
  onCloseCommandPalette,
  ticketDetailsDialog,
  onCloseTicketDetails,
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

    <CommandPalette open={commandPaletteOpen} commands={commands} onClose={onCloseCommandPalette} />

    {ticketDetailsDialog && (
      <TicketDetailsDialog {...ticketDetailsDialog} onClose={onCloseTicketDetails ?? (() => undefined)} />
    )}

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
