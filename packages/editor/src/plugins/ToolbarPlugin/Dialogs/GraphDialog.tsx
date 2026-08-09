"use client";
import type { LexicalEditor } from "lexical";
import {
  INSERT_GRAPH_COMMAND,
  InsertGraphPayload,
} from "@/editor/plugins/GraphPlugin";
import { GraphNode } from "@/editor/nodes/GraphNode";
import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import Script from "next/script";
import { getImageDimensions } from "@/editor/nodes/utils";
import { debounce } from "@/editor/utils/debounce";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogPopup,
  Spinner,
} from "../../../ui";
import { dismissRequest } from "./parts";
import * as css from "./styles.css";
import { ALERT_COMMAND } from "@/editor/commands";
import { v4 as uuid } from "uuid";

interface GeoGebraAPI {
  getBase64(): string;
  setBase64(value: string): void;
  getXML(): string;
  getPNGBase64(scale: number, transparent: boolean, dpi: number): string;
  exportSVG(callback: (html: string) => void): void;
  setSize(width: number, height: number): void;
}

interface GeoGebraParameters {
  key: string;
  language: string;
  showToolBar: boolean;
  borderColor: null;
  showMenuBar: boolean;
  allowStyleBar: boolean;
  showAlgebraInput: boolean;
  enableLabelDrags: boolean;
  enableShiftDragZoom: boolean;
  capturingThreshold: null;
  showToolBarHelp: boolean;
  errorDialogsActive: boolean;
  showTutorialLink: boolean;
  width: number;
  height: number;
  appName: string;
  ggbBase64: string;
  appletOnLoad: (api: GeoGebraAPI) => void;
}

interface NavigationEventTarget {
  addEventListener(
    type: "navigate",
    handler: (event: Event & { navigationType: string }) => void,
  ): void;
  removeEventListener(
    type: "navigate",
    handler: (event: Event & { navigationType: string }) => void,
  ): void;
}

function GraphDialog(
  { editor, node }: { editor: LexicalEditor; node: GraphNode | null },
) {
  const key = useId();
  const [geogebraAPI, setGeogebraAPI] = useState<GeoGebraAPI | null>(null);

  const parameters = {
    key,
    language: "en",
    showToolBar: true,
    borderColor: null,
    showMenuBar: true,
    allowStyleBar: true,
    showAlgebraInput: true,
    enableLabelDrags: false,
    enableShiftDragZoom: true,
    capturingThreshold: null,
    showToolBarHelp: true,
    errorDialogsActive: true,
    showTutorialLink: true,
    width: window.innerWidth,
    height: window.innerHeight - 52.5,
    appName: "suite",
    ggbBase64: node?.getValue() ?? "",
    appletOnLoad(api: GeoGebraAPI) {
      setGeogebraAPI(api);
      const container = document.querySelector<HTMLDivElement>(
        ".ggb-container",
      );
      if (!container) return;
      container.onpointerup = debounce(() => {
        const value = api.getBase64();
        localStorage.setItem("geogebra", value);
      }, 300);
    },
  };
  const clearLocalStorage = useCallback(() => {
    localStorage.removeItem("geogebra");
  }, []);

  const loadGgbBase64 = useCallback(async () => {
    const unsavedValue = localStorage.getItem("geogebra");
    if (unsavedValue) {
      const alert = {
        title: "Restore last unsaved Changes",
        content:
          "You've unsaved changes from last session. Do you want to restore them?",
        actions: [
          { label: "Discard", id: uuid() },
          { label: "Restore", id: uuid() },
        ],
      };
      editor.dispatchCommand(ALERT_COMMAND, alert);
      const id = await new Promise((resolve) => {
        const handler = (event: MouseEvent): void => {
          const target = event.target as HTMLElement;
          const button = target.closest("button");
          const paper = target.closest(".MuiDialog-paper");
          if (paper && !button) {
            document.addEventListener("click", handler, {
              once: true,
            });
            return;
          }
          resolve(button?.id ?? null);
        };
        setTimeout(() => {
          document.addEventListener("click", handler, { once: true });
        }, 0);
      });
      if (!id || id === alert.actions[0].id) {
        clearLocalStorage();
      }
      if (id === alert.actions[1].id) geogebraAPI?.setBase64(unsavedValue);
    }
  }, [editor, clearLocalStorage, geogebraAPI]);

  useEffect(() => {
    if (!geogebraAPI) return;
    loadGgbBase64();
  }, [geogebraAPI, loadGgbBase64]);

  useEffect(() => {
  }, [node]);

  const insertGraph = (payload: InsertGraphPayload) => {
    if (!node) editor.dispatchCommand(INSERT_GRAPH_COMMAND, payload);
    else editor.update(() => node.update(payload));
  };

  const handleSubmit = async () => {
    const app = geogebraAPI;
    if (!app) return;
    const src = await getBase64Src();
    const value = app.getBase64();
    const dimensions = await getImageDimensions(src);
    const showCaption = node?.getShowCaption() ?? true;
    const id = node?.getId() ?? "";
    const style = node?.getStyle() ?? "";
    insertGraph({ src, value, showCaption, ...dimensions, id, style });
    clearLocalStorage();
    closeDialog();
  };

  const getBase64Src = () =>
    new Promise<string>((resolve, _reject) => {
      const app = geogebraAPI;
      if (!app) {
        _reject(new Error("No GeoGebra API"));
        return;
      }
      const xml = app.getXML();
      const subApp = xml.match(/subApp="(.+?)"/)?.[1];
      switch (subApp) {
        case "graphing":
        case "geometry":
        case "cas":
          {
            app.exportSVG((html: string) => {
              const src = "data:image/svg+xml," +
                encodeURIComponent(html);
              resolve(src);
            });
          }
          break;
        default: {
          const src = "data:image/png;base64," +
            app.getPNGBase64(1, true, 72);
          resolve(src);
        }
      }
    });

  const closeDialog = useCallback(() => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { graph: { open: false } });
  }, [editor]);

  const handleClose = useCallback(async () => {
    function discard() {
      clearLocalStorage();
      closeDialog();
    }
    function cancel() {
      closeDialog();
    }
    const unsavedValue = localStorage.getItem("geogebra");
    if (unsavedValue) {
      const alert = {
        title: "Discard unsaved Changes",
        content: "Are you sure you want to discard unsaved changes?",
        actions: [
          { label: "Cancel", id: uuid() },
          { label: "Discard", id: uuid() },
        ],
      };
      editor.dispatchCommand(ALERT_COMMAND, alert);
      const id = await new Promise((resolve) => {
        const handler = (event: MouseEvent): void => {
          const target = event.target as HTMLElement;
          const button = target.closest("button");
          const paper = target.closest(".MuiDialog-paper");
          if (paper && !button) {
            document.addEventListener("click", handler, {
              once: true,
            });
            return;
          }
          resolve(button?.id ?? null);
        };
        setTimeout(() => {
          document.addEventListener("click", handler, { once: true });
        }, 0);
      });
      if (id === alert.actions[1].id) discard();
    } else cancel();
  }, [editor, clearLocalStorage, closeDialog]);

  const loading = !geogebraAPI;

  /*
   * `body.fullscreen` used to be added by MUI's `TransitionProps.onEntered`.
   * The kit's dialog has no enter transition to hang it off — and it never
   * needed one: the class is wanted for as long as this component is mounted,
   * which is exactly what an effect with a cleanup says.
   */
  useEffect(() => {
    document.body.classList.add("fullscreen");
    return () => document.body.classList.remove("fullscreen");
  }, []);

  useEffect(() => {
    const navigation =
      (window as Window & { navigation?: NavigationEventTarget }).navigation;
    if (!navigation) return;

    const preventBackNavigation = (
      event: Event & { navigationType: string },
    ) => {
      if (event.navigationType === "push") return;
      event.preventDefault();
      handleClose();
    };

    navigation.addEventListener("navigate", preventBackNavigation);
    return () => {
      document.body.classList.remove("fullscreen");
      navigation.removeEventListener("navigate", preventBackNavigation);
    };
  }, [handleClose]);

  return (
    /*
     * `modal={false}` — see the note on `SketchDialog`. A full-screen dialog
     * that has to coexist with the app's own (MUI, modal) alert dialog cannot
     * also be trapping focus and marking the rest of the document inert.
     */
    <Dialog
      disablePointerDismissal
      modal={false}
      open
      onOpenChange={dismissRequest(handleClose)}
    >
      <DialogPopup fullScreen="always" showCloseButton={false}>
        <DialogBody flush>
          {loading && (
            <div className={css.appletLoading}>
              <Spinner />
            </div>
          )}
          <div className={css.appletHost}>
            <GeogebraApplet parameters={parameters} />
          </div>
        </DialogBody>
        <DialogFooter>
          <ActionButton onClick={handleClose} size="lg" variant="outline">
            Cancel
          </ActionButton>
          <ActionButton onClick={handleSubmit} size="lg" variant="accent">
            {!node ? "Insert" : "Update"}
          </ActionButton>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

const GeogebraApplet = memo(
  ({ parameters }: { parameters: GeoGebraParameters }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const injectContainer = () => {
      type GGBAppletConstructor = new (
        params: GeoGebraParameters,
        version: string,
      ) => {
        inject(el: HTMLDivElement | null): void;
        setHTML5Codebase(path: string): void;
      };
      const GGBApplet =
        (window as Window & { GGBApplet?: GGBAppletConstructor }).GGBApplet;
      if (!GGBApplet) return;
      const applet = new GGBApplet(parameters, "5.0");
      applet.setHTML5Codebase("/geogebra/HTML5/5.0/web3d/");
      applet.inject(containerRef.current);
    };

    const resizeHandler = () =>
      (window as Window & { ggbApplet?: GeoGebraAPI }).ggbApplet?.setSize(
        window.innerWidth,
        window.innerHeight - 52.5,
      );

    useEffect(() => {
      window.addEventListener("resize", resizeHandler);
      return () => window.removeEventListener("resize", resizeHandler);
    }, []);

    return (
      <>
        <div ref={containerRef} className="ggb-container" />
        <Script
          src="/geogebra/deployggb.js"
          onReady={injectContainer}
        />
      </>
    );
  },
  (prevProps, nextProps) =>
    prevProps.parameters.key === nextProps.parameters.key,
);

export default memo(GraphDialog);
