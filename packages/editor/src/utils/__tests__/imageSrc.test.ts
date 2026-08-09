/**
 * The image toolbar's src guard.
 *
 * Every case below is a URL the toolbar would hand straight to `window.open`
 * or to an `<a download>`. The half that matters is the *refusals*: an
 * allow-list that accepts everything reads exactly like a correct one from the
 * call site, so the cases haklex's deny-list let through are pinned by name.
 */
import {
  imageFileName,
  isDirectDownloadSrc,
  isOpenableImageSrc,
  isSafeImageSrc,
} from "../imageSrc";

const ORIGIN = "https://blog.example";

describe("isSafeImageSrc", () => {
  it("accepts the four shapes a real document holds", () => {
    // An uploaded attachment: relative, session-gated, same origin.
    expect(isSafeImageSrc("/api/attachments/attach_abc_ff.png")).toBe(true);
    // A pasted external image.
    expect(isSafeImageSrc("https://cdn.example/photo.jpg")).toBe(true);
    expect(isSafeImageSrc("http://cdn.example/photo.jpg")).toBe(true);
    // A graph or a sketch, whose whole picture is the src.
    expect(isSafeImageSrc("data:image/svg+xml;utf8,<svg/>")).toBe(true);
    expect(isSafeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("accepts relative and scheme-relative srcs", () => {
    expect(isSafeImageSrc("photo.png")).toBe(true);
    expect(isSafeImageSrc("./photo.png")).toBe(true);
    expect(isSafeImageSrc("../assets/photo.png")).toBe(true);
    expect(isSafeImageSrc("//cdn.example/photo.png")).toBe(true);
    // A colon after the first slash is a path character, not a scheme.
    expect(isSafeImageSrc("/api/attachments/a:b.png")).toBe(true);
  });

  it("refuses the executable schemes", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("JavaScript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("vbscript:msgbox(1)")).toBe(false);
  });

  it("refuses a non-image data: URL", () => {
    expect(isSafeImageSrc("data:text/html,<script>alert(1)</script>"))
      .toBe(false);
    expect(isSafeImageSrc("data:application/javascript,alert(1)")).toBe(false);
  });

  /**
   * The hardening over haklex's regex. Each of these is `true` under
   * `!/^(?:javascript\s*:|…)/i` — its anchor is defeated by anything the
   * browser strips before it resolves the URL, and `\s` does not cover NUL.
   */
  it("refuses what a leading or embedded ignorable character hides", () => {
    expect(isSafeImageSrc(" javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("\tjavascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("\u0000javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("java\nscript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("java\tscript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("\u0000data:text/html,x")).toBe(false);
  });

  /** The other half: schemes nobody enumerated, which a deny-list admits. */
  it("refuses schemes the deny-list never named", () => {
    expect(isSafeImageSrc("file:///etc/passwd")).toBe(false);
    expect(isSafeImageSrc("filesystem:https://x/temporary/a.png")).toBe(false);
    expect(isSafeImageSrc("intent://scan/#Intent;end")).toBe(false);
    expect(isSafeImageSrc("chrome://settings")).toBe(false);
    expect(isSafeImageSrc("about:blank")).toBe(false);
  });
});

describe("isOpenableImageSrc", () => {
  it("opens what a tab can actually show", () => {
    expect(isOpenableImageSrc("https://cdn.example/photo.jpg")).toBe(true);
    expect(isOpenableImageSrc("/api/attachments/a.png")).toBe(true);
  });

  it("refuses a data: URL, which the browser will not navigate to", () => {
    // Every graph and every sketch is in this case.
    expect(isOpenableImageSrc("data:image/svg+xml;utf8,<svg/>")).toBe(false);
    expect(isOpenableImageSrc("data:image/png;base64,iVBOR")).toBe(false);
  });

  it("still refuses everything unsafe", () => {
    expect(isOpenableImageSrc("javascript:alert(1)")).toBe(false);
  });
});

describe("isDirectDownloadSrc", () => {
  it("is direct for a same-origin attachment, however it is written", () => {
    expect(isDirectDownloadSrc("/api/attachments/a.png", ORIGIN)).toBe(true);
    expect(isDirectDownloadSrc("a.png", ORIGIN)).toBe(true);
    expect(isDirectDownloadSrc(`${ORIGIN}/api/attachments/a.png`, ORIGIN))
      .toBe(true);
  });

  it("is direct for data: and blob:", () => {
    expect(isDirectDownloadSrc("data:image/png;base64,iVBOR", ORIGIN))
      .toBe(true);
    expect(isDirectDownloadSrc(`blob:${ORIGIN}/8a-2f`, ORIGIN)).toBe(true);
  });

  it("is not direct cross-origin, where `download` is ignored", () => {
    expect(isDirectDownloadSrc("https://cdn.example/photo.jpg", ORIGIN))
      .toBe(false);
    // Scheme-relative carries no scheme but is still another host.
    expect(isDirectDownloadSrc("//cdn.example/photo.jpg", ORIGIN))
      .toBe(false);
    // Same host, different scheme — a different origin.
    expect(isDirectDownloadSrc("http://blog.example/a.png", ORIGIN))
      .toBe(false);
  });

  it("is not direct for something that will not parse", () => {
    expect(isDirectDownloadSrc("http://[", ORIGIN)).toBe(false);
  });
});

describe("imageFileName", () => {
  it("takes the extension from the src when the alt text has none", () => {
    expect(imageFileName("/api/attachments/attach_ab_ff.png", "Fig 1"))
      .toBe("Fig 1.png");
    expect(imageFileName("https://cdn.example/a/photo.JPEG", "Sunset"))
      .toBe("Sunset.jpeg");
  });

  it("reads a data: URL's mime, and unwraps svg+xml", () => {
    expect(imageFileName("data:image/svg+xml;utf8,<svg/>", "Graph"))
      .toBe("Graph.svg");
    expect(imageFileName("data:image/png;base64,iVBOR", "Sketch"))
      .toBe("Sketch.png");
  });

  it("ignores a query, a fragment and a directory that looks like a file", () => {
    expect(imageFileName("https://cdn.example/p.png?w=64#x", "A"))
      .toBe("A.png");
    expect(imageFileName("https://cdn.example/v1.2/photo", "A")).toBe("A");
  });

  it("does not repeat an extension the alt text already carries", () => {
    expect(imageFileName("/a/photo.png", "photo.png")).toBe("photo.png");
    expect(imageFileName("/a/photo.png", "PHOTO.PNG")).toBe("PHOTO.PNG");
  });

  it("strips what a filename may not contain, and falls back", () => {
    expect(imageFileName("/a/b.png", "../../etc/passwd"))
      .toBe("....etcpasswd.png");
    expect(imageFileName("/a/b.png", "")).toBe("image.png");
    expect(imageFileName("/a/b.png", "   ")).toBe("image.png");
    expect(imageFileName("/a/b", "")).toBe("image");
  });

  it("caps a runaway alt text", () => {
    const name = imageFileName("/a/b.png", "x".repeat(200));
    expect(name).toBe(`${"x".repeat(64)}.png`);
  });
});
