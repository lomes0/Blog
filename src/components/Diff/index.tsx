"use client";
import HtmlDiff from "@/lib/diff/Diff";
import { useCallback, useEffect, useState } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { generateHtml } from "@/editor/utils/generateHtml";
import htmr from "htmr";
import NProgress from "nprogress";

const DiffView = () => {
  const dispatch = useDispatch();
  // Which revisions to compare is global; whether this pane shows the result is
  // the pane's own `diffOpen`, which is what gates rendering DiffView at all.
  const diff = useSelector((state) => state.ui.diff);
  const [html, setHtml] = useState<string>("");

  const getEditorDocumentRevision = useCallback(async (revisionId: string) => {
    try {
      return await dispatch(actions.getRevision(revisionId))
        .unwrap() as ReturnType<
          typeof actions.getRevision.fulfilled
        >["payload"];
    } catch {
      // not in local, try cloud
    }
    try {
      const editorDocumentRevision = await dispatch(
        actions.getRevision(revisionId),
      ).unwrap() as ReturnType<
        typeof actions.getRevision.fulfilled
      >["payload"];
      dispatch(actions.createRevision(editorDocumentRevision));
      return editorDocumentRevision;
    } catch {
      return undefined;
    }
  }, [dispatch]);

  useEffect(() => {
    const diffRevisions = async () => {
      const oldRevisionId = diff.old;
      const newRevisionId = diff.new;
      if (!oldRevisionId || !newRevisionId) return;
      const oldRevision = await getEditorDocumentRevision(oldRevisionId);
      if (!oldRevision) return;
      const oldHtml = await generateHtml(oldRevision.data);
      if (oldRevisionId === newRevisionId) return setHtml(oldHtml);
      const newRevision = await getEditorDocumentRevision(newRevisionId);
      if (!newRevision) return;
      const newHtml = await generateHtml(newRevision.data);
      const html = HtmlDiff.execute(oldHtml, newHtml);
      setHtml(html);
    };
    NProgress.start();
    diffRevisions().then(() => NProgress.done());
    return () => {
      NProgress.done();
    };
  }, [diff, getEditorDocumentRevision]);

  if (!html) return null;

  return <div className="diff-container">{htmr(html)}</div>;
};

export default DiffView;
