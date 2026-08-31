/**
 * What kind of file is this?
 *
 * Syntax-highlighting detection, plus the two predicates that decide whether an
 * attachment may be previewed ({@link isTextFile}) or written back
 * ({@link isEditable}). Both had a client copy and a server copy; they live here
 * so the UI cannot offer an action the route will refuse, or hide one it allows.
 */

// Map file extensions to Prism language identifiers
const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  mjs: "javascript",
  cjs: "javascript",

  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  svg: "svg",
  xml: "xml",

  // Data formats
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  csv: "csv",

  // Markup
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  tex: "latex",
  latex: "latex",

  // Shell
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "powershell",
  bat: "batch",
  cmd: "batch",

  // Python
  py: "python",
  pyw: "python",
  pyx: "python",

  // Ruby
  rb: "ruby",
  rake: "ruby",
  gemspec: "ruby",

  // PHP
  php: "php",

  // Java/JVM
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "groovy",
  gradle: "groovy",

  // C-family
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  m: "objectivec",
  mm: "objectivec",

  // Systems languages
  go: "go",
  rs: "rust",
  swift: "swift",
  zig: "zig",

  // Database
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  prisma: "prisma",

  // Config files
  dockerfile: "docker",
  makefile: "makefile",
  cmake: "cmake",
  nginx: "nginx",

  // Other
  r: "r",
  lua: "lua",
  perl: "perl",
  pl: "perl",
  vim: "vim",
  diff: "diff",
  patch: "diff",
  asm: "asm6502",
  wasm: "wasm",

  // Frameworks
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
};

// Map MIME types to Prism language identifiers
const mimetypeToLanguage: Record<string, string> = {
  "text/javascript": "javascript",
  "application/javascript": "javascript",
  "application/x-javascript": "javascript",
  "text/typescript": "typescript",
  "application/typescript": "typescript",
  "application/x-typescript": "typescript",
  "text/html": "html",
  "text/css": "css",
  "text/xml": "xml",
  "application/xml": "xml",
  "application/json": "json",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  "text/x-python": "python",
  "application/x-python": "python",
  "text/x-ruby": "ruby",
  "application/x-ruby": "ruby",
  "text/x-php": "php",
  "application/x-php": "php",
  "text/x-java": "java",
  "text/x-c": "c",
  "text/x-c++": "cpp",
  "text/x-csharp": "csharp",
  "application/x-sh": "bash",
  "application/x-shellscript": "bash",
  "text/x-shellscript": "bash",
  "application/yaml": "yaml",
  "application/x-yaml": "yaml",
  "text/yaml": "yaml",
  "text/csv": "csv",
  "text/x-sql": "sql",
  "application/sql": "sql",
};

// Languages that Prism supports (common ones)
const supportedLanguages = new Set([
  "markup",
  "html",
  "xml",
  "svg",
  "mathml",
  "css",
  "clike",
  "javascript",
  "js",
  "jsx",
  "typescript",
  "ts",
  "tsx",
  "json",
  "yaml",
  "markdown",
  "md",
  "python",
  "py",
  "bash",
  "shell",
  "sh",
  "sql",
  "graphql",
  "java",
  "c",
  "cpp",
  "csharp",
  "cs",
  "go",
  "rust",
  "swift",
  "kotlin",
  "scala",
  "ruby",
  "rb",
  "php",
  "perl",
  "lua",
  "r",
  "diff",
  "docker",
  "dockerfile",
  "makefile",
  "nginx",
  "regex",
  "toml",
  "ini",
  "latex",
  "tex",
  "scss",
  "less",
  "vim",
  "powershell",
  "batch",
]);

/**
 * Detect programming language from filename
 * @param filename - The name of the file
 * @returns The Prism language identifier or null if not detected
 */
export function detectLanguageFromFilename(filename: string): string | null {
  // Get extension from filename
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && extensionToLanguage[ext]) {
    return extensionToLanguage[ext];
  }

  // Check for common config files without extensions
  const baseName = filename.toLowerCase();
  const configFileLanguages: Record<string, string> = {
    dockerfile: "docker",
    makefile: "makefile",
    gemfile: "ruby",
    rakefile: "ruby",
    procfile: "yaml",
    jenkinsfile: "groovy",
    vagrantfile: "ruby",
    ".gitignore": "text",
    ".dockerignore": "text",
    ".env": "text",
    ".editorconfig": "ini",
    ".eslintrc": "json",
    ".prettierrc": "json",
    ".babelrc": "json",
    "tsconfig.json": "json",
    "package.json": "json",
    "composer.json": "json",
    "cargo.toml": "toml",
    "go.mod": "go",
    "go.sum": "text",
  };

  if (configFileLanguages[baseName]) {
    return configFileLanguages[baseName];
  }

  return null;
}

/**
 * Detect programming language from MIME type
 * @param mimetype - The MIME type of the file
 * @returns The Prism language identifier or null if not detected
 */
function detectLanguageFromMimetype(mimetype: string): string | null {
  // Direct mapping
  if (mimetypeToLanguage[mimetype]) {
    return mimetypeToLanguage[mimetype];
  }

  // Generic text types
  if (mimetype.startsWith("text/")) {
    const subtype = mimetype.split("/")[1];
    if (subtype && extensionToLanguage[subtype]) {
      return extensionToLanguage[subtype];
    }
    return "text";
  }

  return null;
}

/**
 * Check if a language is supported by Prism
 * @param language - The language identifier
 * @returns true if the language is supported
 */
function isPrismLanguageSupported(language: string): boolean {
  return supportedLanguages.has(language.toLowerCase());
}

/**
 * Get the best language for syntax highlighting
 * @param filename - The filename
 * @param mimetype - The MIME type
 * @returns The best language identifier or "text" as fallback
 */
export function detectLanguage(filename: string, mimetype: string): string {
  // Try filename first (more accurate)
  const fromFilename = detectLanguageFromFilename(filename);
  if (fromFilename && isPrismLanguageSupported(fromFilename)) {
    return fromFilename;
  }

  // Fall back to MIME type
  const fromMimetype = detectLanguageFromMimetype(mimetype);
  if (fromMimetype && isPrismLanguageSupported(fromMimetype)) {
    return fromMimetype;
  }

  // If filename detection worked but language isn't supported, still return it
  // (Prism may have partial support or plugins)
  if (fromFilename) {
    return fromFilename;
  }

  return "text";
}

/**
 * Get a human-readable language name
 * @param language - The language identifier
 * @returns Human-readable language name
 */
export function getLanguageDisplayName(language: string): string {
  const displayNames: Record<string, string> = {
    javascript: "JavaScript",
    js: "JavaScript",
    jsx: "JSX",
    typescript: "TypeScript",
    ts: "TypeScript",
    tsx: "TSX",
    python: "Python",
    py: "Python",
    ruby: "Ruby",
    rb: "Ruby",
    php: "PHP",
    java: "Java",
    csharp: "C#",
    cs: "C#",
    cpp: "C++",
    c: "C",
    go: "Go",
    rust: "Rust",
    swift: "Swift",
    kotlin: "Kotlin",
    scala: "Scala",
    bash: "Bash",
    shell: "Shell",
    sh: "Shell",
    sql: "SQL",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    json: "JSON",
    yaml: "YAML",
    xml: "XML",
    markdown: "Markdown",
    md: "Markdown",
    graphql: "GraphQL",
    docker: "Dockerfile",
    dockerfile: "Dockerfile",
    makefile: "Makefile",
    text: "Plain Text",
    toml: "TOML",
    ini: "INI",
    diff: "Diff",
    latex: "LaTeX",
    tex: "LaTeX",
    nginx: "Nginx",
    vim: "Vim",
    lua: "Lua",
    perl: "Perl",
    r: "R",
  };

  return displayNames[language.toLowerCase()] || language.toUpperCase();
}

/**
 * `application/*` types that are text despite not being `text/*`.
 *
 * Structured-syntax suffixes (`+json`, `+xml`) are handled separately below, so
 * this list only needs the types that carry no suffix.
 */
const TEXT_APPLICATION_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-typescript",
  "application/xml",
  "application/sql",
  "application/x-sql",
  "application/graphql",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
  "application/x-toml",
  "application/x-sh",
  "application/x-shellscript",
  "application/x-python",
  "application/x-ruby",
  "application/x-php",
  "application/x-httpd-php",
  "application/x-perl",
]);

/**
 * Extensions that are text regardless of the MIME type an upload arrived with.
 *
 * Deliberately *not* derived from {@link extensionToLanguage}: that map answers
 * "which Prism grammar highlights this", a narrower question. `.log`, `.csv` and
 * `.env` are all readable text with no grammar to their name, and would drop out
 * of a derived set.
 */
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "xml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "fish",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "swift",
  "kt",
  "scala",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
  "astro",
  "prisma",
  "env",
  "gitignore",
  "dockerignore",
  "editorconfig",
  "eslintrc",
  "prettierrc",
  "babelrc",
  "dockerfile",
  "makefile",
  "cmake",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "csv",
  "tsv",
]);

/** Text files whose whole name is the type — they have no extension to check. */
const EXTENSIONLESS_TEXT_FILES = new Set([
  "dockerfile",
  "makefile",
  "gemfile",
  "rakefile",
  "procfile",
  "jenkinsfile",
  "vagrantfile",
]);

/**
 * Whether a file can be read and previewed as text.
 *
 * **This is the only implementation.** There were three — this one, a stricter
 * MIME-only copy behind the preview button in `AttachmentComponent`, and a
 * looser one in `GET /api/attachments/[filename]/content` that gates whether the
 * bytes are served at all. They disagreed in both directions, so a `.toml` or
 * `.log` upload got no preview button for content the server would happily have
 * returned, and a `.py` file stored as `application/octet-stream` previewed on
 * one screen but not another.
 *
 * The union of the three is what survives, because the server's answer is the
 * one that decides: a UI predicate stricter than the route can only hide
 * readable content, and one looser can only offer a preview that 415s.
 *
 * @param mimetype - The MIME type the file was uploaded with.
 * @param filename - Checked when given. Uploads routinely arrive as
 *   `application/octet-stream`, and then the name is the only evidence there is;
 *   omit it only where no name is in scope.
 */
export function isTextFile(mimetype: string, filename?: string): boolean {
  if (mimetype.startsWith("text/")) return true;
  if (TEXT_APPLICATION_TYPES.has(mimetype)) return true;

  // RFC 6839 structured syntax suffixes: `application/ld+json`,
  // `application/atom+xml` and friends are text by construction.
  if (mimetype.endsWith("+json") || mimetype.endsWith("+xml")) return true;

  if (filename === undefined) return false;

  const baseName = filename.toLowerCase();
  if (EXTENSIONLESS_TEXT_FILES.has(baseName)) return true;

  const ext = baseName.split(".").pop() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Extensions an attachment may be *written* through, as opposed to merely read.
 *
 * A strict subset of {@link TEXT_EXTENSIONS}, and deliberately its own list
 * rather than being derived from it: this one is a write policy, so widening it
 * is a decision someone has to make on purpose. Deriving it would silently grant
 * write access to every extension a future preview-only entry adds.
 */
const EDITABLE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "xml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "swift",
  "kt",
  "scala",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
  "astro",
  "prisma",
  "env",
  "gitignore",
  "dockerfile",
  "makefile",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "csv",
  "tsv",
]);

/** Extensionless files the editor accepts writes to. */
const EXTENSIONLESS_EDITABLE_FILES = new Set([
  "dockerfile",
  "makefile",
  "gemfile",
  "rakefile",
  "procfile",
]);

/**
 * Whether an attachment may be edited in place.
 *
 * **This is the only implementation.** `PUT /api/attachments/[filename]` and the
 * attachment drawer's edit affordance each carried a verbatim copy of the same
 * 53-entry set. They had not drifted yet — unlike {@link isTextFile}, which had
 * three copies that disagreed — so this is the same list, shared before it
 * could.
 */
export function isEditable(filename: string): boolean {
  const baseName = filename.toLowerCase();
  if (EXTENSIONLESS_EDITABLE_FILES.has(baseName)) return true;

  const ext = baseName.split(".").pop() ?? "";
  return EDITABLE_EXTENSIONS.has(ext);
}
