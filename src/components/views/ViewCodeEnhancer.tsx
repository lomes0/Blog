"use client";
import React, { useCallback, useEffect } from "react";
import {
  codeLanguageGlyph,
  codeLanguageLabel,
} from "@/editor/utils/codeLanguage";

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15.5A2.5 2.5 0 0 1 4 13.5v-7A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 15.5 5"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6.5"/></svg>';
const CHEVRON_ICON =
  '<svg class="code-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14.5 12 8.5 18 14.5"/></svg>';

/**
 * Enhances code blocks in view mode by wrapping each exported code element
 * (`<pre class="LexicalTheme__code">`) with a head bar (language pill + copy +
 * collapse) that mirrors the authoring chrome.
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

    // View-mode HTML is produced by `CodeNode.exportDOM`, which emits a
    // `<pre class="LexicalTheme__code">` (the editor uses `<code>` via
    // `createDOM`). Match both tags so the head bar is injected regardless of
    // which element rendered the block.
    const blocks = root.querySelectorAll<HTMLElement>(
      "pre.LexicalTheme__code, code.LexicalTheme__code",
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
      const label = codeLanguageLabel(lang || null);
      const glyph = codeLanguageGlyph(lang || null);

      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";

      // The exported <pre> carries the author-set width (e.g. "50%"). Move it
      // onto the wrapper so the header and body shrink together; otherwise the
      // chrome would stay full-width while only the inner scroll column shrank.
      const width = code.style.width;
      if (width) {
        wrapper.style.width = width;
        code.style.width = "";
      }

      const header = document.createElement("div");
      header.className = "code-block-header";

      const langEl = document.createElement("span");
      langEl.className = "code-block-lang";

      const glyphEl = document.createElement("span");
      glyphEl.className = "code-lang-glyph";
      glyphEl.textContent = glyph.text;
      glyphEl.style.setProperty("--code-glyph-bg", glyph.bg);
      glyphEl.style.setProperty("--code-glyph-fg", glyph.fg);

      const labelEl = document.createElement("span");
      labelEl.textContent = label;

      langEl.appendChild(glyphEl);
      langEl.appendChild(labelEl);

      const spacer = document.createElement("span");
      spacer.className = "code-head-spacer";

      const actions = document.createElement("div");
      actions.className = "code-block-actions";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "code-block-iconbtn";
      copyBtn.setAttribute("aria-label", "Copy code to clipboard");
      copyBtn.innerHTML = COPY_ICON +
        '<span class="code-copy-label">Copy</span>';

      let resetTimer: ReturnType<typeof setTimeout> | undefined;
      copyBtn.addEventListener("click", () => {
        // `innerText` preserves rendered line breaks (<br>) and excludes the
        // line-number gutter, which is a CSS ::before pseudo-element.
        const text = code.innerText;
        navigator.clipboard?.writeText(text).then(() => {
          copyBtn.classList.add("copied");
          copyBtn.innerHTML = CHECK_ICON +
            '<span class="code-copy-label">Copied</span>';
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyBtn.innerHTML = COPY_ICON +
              '<span class="code-copy-label">Copy</span>';
          }, 1500);
        }).catch(() => {});
      });

      const divider = document.createElement("span");
      divider.className = "code-head-divider";

      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.className = "code-block-iconbtn";
      collapseBtn.setAttribute("aria-label", "Collapse code");
      collapseBtn.innerHTML = CHEVRON_ICON;
      collapseBtn.addEventListener("click", () => {
        const collapsed = wrapper.classList.toggle("collapsed");
        collapseBtn.setAttribute(
          "aria-label",
          collapsed ? "Expand code" : "Collapse code",
        );
      });

      actions.appendChild(copyBtn);
      actions.appendChild(divider);
      actions.appendChild(collapseBtn);

      header.appendChild(langEl);
      header.appendChild(spacer);
      header.appendChild(actions);

      const body = document.createElement("div");
      body.className = "code-block-body";

      code.parentNode?.insertBefore(wrapper, code);
      wrapper.appendChild(header);
      wrapper.appendChild(body);
      body.appendChild(code);
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
