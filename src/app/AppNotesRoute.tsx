import type { ComponentProps } from "react";
import { NotesWorkspace } from "../components/NotesWorkspace";

export type AppNotesRouteProps = ComponentProps<typeof NotesWorkspace>;

export const AppNotesRoute = (props: AppNotesRouteProps) => <NotesWorkspace {...props} />;
