import type { ComponentProps } from "react";
import { SettingsView } from "../components/SettingsView";

type SettingsViewProps = ComponentProps<typeof SettingsView>;

export interface AppSettingsRouteProps {
  settingsDraft: SettingsViewProps["draft"];
  setSettingsDraft: SettingsViewProps["onDraftChange"];
  handleSaveSettings: SettingsViewProps["onSave"];
  handleTestConnection: SettingsViewProps["onTestConnection"];
  handleTestBitbucketConnection: SettingsViewProps["onTestBitbucketConnection"];
  isTesting: SettingsViewProps["isTesting"];
  isTestingBitbucket: SettingsViewProps["isTestingBitbucket"];
  effectiveTheme: SettingsViewProps["effectiveTheme"];
  selectTheme: SettingsViewProps["onSelectTheme"];
  updateInfo: SettingsViewProps["updateInfo"];
  isCheckingUpdates: SettingsViewProps["isCheckingUpdates"];
  checkForUpdatesFromSettings: SettingsViewProps["onCheckForUpdates"];
  openCurrentReleaseNotes: SettingsViewProps["onShowReleaseNotes"];
  openCurrentUpdateDownload: SettingsViewProps["onDownloadUpdate"];
  openReleasePage: SettingsViewProps["onOpenReleasePage"];
  weekRangeLabel: SettingsViewProps["weekRangeLabel"];
  handleExportWeekCsv: SettingsViewProps["onExportWeekCsv"];
  handleImportPersonalNotes: SettingsViewProps["onImportPersonalNotes"];
  isImportingPersonalNotes: SettingsViewProps["isImportingPersonalNotes"];
  recurringEvents: SettingsViewProps["recurringEvents"];
  handleSaveRecurringEvent: SettingsViewProps["onSaveRecurringEvent"];
  handleDeleteRecurringEvent: SettingsViewProps["onDeleteRecurringEvent"];
  handleToggleRecurringEvent: SettingsViewProps["onToggleRecurringEvent"];
}

export const AppSettingsRoute = ({
  settingsDraft,
  setSettingsDraft,
  handleSaveSettings,
  handleTestConnection,
  handleTestBitbucketConnection,
  isTesting,
  isTestingBitbucket,
  effectiveTheme,
  selectTheme,
  updateInfo,
  isCheckingUpdates,
  checkForUpdatesFromSettings,
  openCurrentReleaseNotes,
  openCurrentUpdateDownload,
  openReleasePage,
  weekRangeLabel,
  handleExportWeekCsv,
  handleImportPersonalNotes,
  isImportingPersonalNotes,
  recurringEvents,
  handleSaveRecurringEvent,
  handleDeleteRecurringEvent,
  handleToggleRecurringEvent
}: AppSettingsRouteProps) => (
  <SettingsView
    draft={settingsDraft}
    onDraftChange={setSettingsDraft}
    onSave={handleSaveSettings}
    onTestConnection={handleTestConnection}
    onTestBitbucketConnection={handleTestBitbucketConnection}
    isTesting={isTesting}
    isTestingBitbucket={isTestingBitbucket}
    effectiveTheme={effectiveTheme}
    onSelectTheme={selectTheme}
    updateInfo={updateInfo}
    isCheckingUpdates={isCheckingUpdates}
    onCheckForUpdates={checkForUpdatesFromSettings}
    onShowReleaseNotes={openCurrentReleaseNotes}
    onDownloadUpdate={openCurrentUpdateDownload}
    onOpenReleasePage={openReleasePage}
    weekRangeLabel={weekRangeLabel}
    onExportWeekCsv={handleExportWeekCsv}
    onImportPersonalNotes={handleImportPersonalNotes}
    isImportingPersonalNotes={isImportingPersonalNotes}
    recurringEvents={recurringEvents}
    onSaveRecurringEvent={handleSaveRecurringEvent}
    onDeleteRecurringEvent={handleDeleteRecurringEvent}
    onToggleRecurringEvent={handleToggleRecurringEvent}
  />
);
