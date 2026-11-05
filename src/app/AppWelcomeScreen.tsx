import type { ComponentProps } from "react";
import { SnackbarStack } from "../components/SnackbarStack";
import type { ThemeMode } from "../components/Sidebar";
import { WelcomeView } from "../components/WelcomeView";

type WelcomeViewProps = ComponentProps<typeof WelcomeView>;
type SnackbarStackProps = ComponentProps<typeof SnackbarStack>;

interface AppWelcomeScreenProps {
  theme: ThemeMode;
  initialSettings: WelcomeViewProps["initialSettings"];
  isConnected: WelcomeViewProps["isConnected"];
  connectedSettings: WelcomeViewProps["connectedSettings"];
  onConnect: WelcomeViewProps["onConnect"];
  onEnterApp: WelcomeViewProps["onEnterApp"];
  onRestoreBackup?: WelcomeViewProps["onRestoreBackup"];
  notifications: SnackbarStackProps["notifications"];
  onDismissNotification: SnackbarStackProps["onDismiss"];
}

export const AppWelcomeScreen = ({
  theme,
  initialSettings,
  isConnected,
  connectedSettings,
  onConnect,
  onEnterApp,
  onRestoreBackup,
  notifications,
  onDismissNotification
}: AppWelcomeScreenProps) => (
  <div className="app-shell" data-theme={theme} data-view="welcome">
    <WelcomeView
      initialSettings={initialSettings}
      isConnected={isConnected}
      connectedSettings={connectedSettings}
      onConnect={onConnect}
      onEnterApp={onEnterApp}
      onRestoreBackup={onRestoreBackup}
    />
    <SnackbarStack notifications={notifications} onDismiss={onDismissNotification} />
  </div>
);
