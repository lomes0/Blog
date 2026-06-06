"use client";
import React, { useCallback, useEffect } from "react";
import { getLanguageFriendlyName } from "@lexical/code";

/**
 * Enhances code blocks in view mode by wrapping each `<code>` element with a
 * header bar that shows the language label and a "Copy" button.
 *
 * View-mode content is static HTML (generated via `$generateHtmlFromNodes`),
 * so there is no React tree for code blocks. We progressively enhance the DOM
 * directly, mirroring the approach used by `ViewAttachmentEnhancer`. A
 * `MutationObserver` re-runs the enhancement when the rendered content changes
 * (e.g. switching document tabs).
 */
const ViewCodeEnhancer: React.FC<
  { containerRef: React.RefObject<HTMLElement | null> }
> = ({ containerRef }) => {
  const enhance = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    const blocks = root.querySelectorAll<HTMLElement>(
      "code.LexicalTheme__code",
    );

    blocks.forEach((code) => {
      if (code.dataset.codeEnhanced === "true") return;
      code.dataset.codeEnhanced = "true";

      // Skip code blocks inside layout columns: they intentionally hide the
      // gutter for symmetry and wrapping them would disrupt the column layout.
      if (code.closest(".LexicalTheme__layoutItem")) return;

      const lang = code.getAttribute("data-language") ||
        code.getAttribute("data-highlight-language") ||
        "";
      const label = lang ? getLanguageFriendlyName(lang) : "Code";

      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";

      const header = document.createElement("div");
      header.className = "code-block-header";

      const langEl = document.createElement("span");
      langEl.className = "code-block-lang";
      langEl.textContent = label;

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "code-block-copy";
      copyBtn.textContent = "Copy";
      copyBtn.setAttribute("aria-label", "Copy code to clipboard");

      let resetTimer: ReturnType<typeof setTimeout> | undefined;
      copyBtn.addEventListener("click", () => {
        // `innerText` preserves rendered line breaks (<br>) and excludes the
        // line-number gutter, which is a CSS ::before pseudo-element.
        const text = code.innerText;
        navigator.clipboard?.writeText(text).then(() => {
          copyBtn.textContent = "Copied";
          copyBtn.classList.add("copied");
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            copyBtn.textContent = "Copy";
            copyBtn.classList.remove("copied");
          }, 1500);
        }).catch(() => {});
      });

      header.appendChild(langEl);
      header.appendChild(copyBtn);

      code.parentNode?.insertBefore(wrapper, code);
      wrapper.appendChild(header);
      wrapper.appendChild(code);
    });
  }, [containerRef]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(enhance);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [enhance, containerRef]);

  return null;
};

export default ViewCodeEnhancer;
