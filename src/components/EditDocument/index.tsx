"use client";
import dynamic from "next/dynamic";
import { Component, ErrorInfo, ReactNode, Suspense } from "react";
import { EditorSkeleton } from "../shared/EditorSkeleton";
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

const EditDocument: React.FC<React.PropsWithChildren> = ({ children }) => {
  // The editor chunk is large (Lexical, its nodes, the toolbar), so this
  // fallback is on screen for a real fraction of a cold load. It used to be
  // `SplashScreen`, which is a fixed full-viewport overlay — the sidebar and
  // rails had already painted underneath and were covered up by it.
  //
  // `EditorSkeleton` is the right stand-in only where `children` are SSR'd
  // content in an app-shell toolbar layout, which no route now does. `/edit`
  // passes none (the layout renders `<EditDocument />` bare), so this arm was
  // the only one it ever took.
  const fallback = children
    ? <EditorSkeleton>{children}</EditorSkeleton>
    : <PaneSkeleton withToolbar />;

  return (
    <EditorErrorBoundary>
      <Suspense fallback={fallback}>
        <DocumentEditor>{children}</DocumentEditor>
      </Suspense>
    </EditorErrorBoundary>
  );
};

export default EditDocument;
