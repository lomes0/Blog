import StoreProvider from "@/store/StoreProvider";
import AlertDialog from "./Alert";
import Announcer from "./Announcer";
import ProgressBar from "./ProgressBar";
import AppLayoutContent from "./AppLayoutContent";
import { Suspense } from "react";
import { SidebarWidthProvider } from "@/contexts/SidebarWidthContext";
import { LayoutModeProvider } from "@/contexts/LayoutModeContext";
import { TopBarActionsProvider } from "@/contexts/TopBarActionsContext";
import { ToolbarSlotProvider } from "@/contexts/ToolbarSlotContext";
import { CommandProvider } from "@/commands/CommandProvider";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <Suspense>
        <ProgressBar />
      </Suspense>
      <StoreProvider>
        <SidebarWidthProvider>
          <LayoutModeProvider>
            <TopBarActionsProvider>
              <ToolbarSlotProvider>
                {/* Innermost: the command context is built from the store, the
                    color scheme and the layout mode, so it has to sit under all
                    three. */}
                <CommandProvider>
                  <AppLayoutContent>{children}</AppLayoutContent>
                  <AlertDialog />
                  <Announcer />
                </CommandProvider>
              </ToolbarSlotProvider>
            </TopBarActionsProvider>
          </LayoutModeProvider>
        </SidebarWidthProvider>
      </StoreProvider>
    </>
  );
};

export default AppLayout;
