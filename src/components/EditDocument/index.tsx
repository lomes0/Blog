"use client";
import dynamic from "next/dynamic";
import { Component, ErrorInfo, ReactNode, Suspense } from "react";
import SplashScreen from "../shared/SplashScreen";
import PaneSkeleton from "./PaneSkeleton";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class EditorErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Editor error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SplashScreen
          title="Editor Error"
          subtitle={`Something went wrong: ${
            this.state.error?.message || "Unknown error"
          }`}
        />
      );
    }

    return this.props.children;
  }
}

const DocumentEditor = dynamic(() => import("./EditDocumentContent"), {
  ssr: false,
});

const EditDocument: React.FC = () => {
  // The editor chunk is large (Lexical, its nodes, the toolbar), so this
  // fallback is on screen for a real fraction of a cold load. It used to be
  // `SplashScreen`, which is a fixed full-viewport overlay — the sidebar and
  // rails had already painted underneath and were covered up by it.
  //
  // There used to be a second arm here, swapping in `shared/EditorSkeleton`
  // when `children` were SSR'd content in an app-shell toolbar layout. Only
  // `/playground` and `/tutorial` were ever shaped that way and neither
  // survives; `/edit`'s layout renders `<EditDocument />` bare, so the arm was
  // unreachable and went with them.
  return (
    <EditorErrorBoundary>
      <Suspense fallback={<PaneSkeleton withToolbar />}>
        <DocumentEditor />
      </Suspense>
    </EditorErrorBoundary>
  );
};

export default EditDocument;
