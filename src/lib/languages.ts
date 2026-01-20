/**
 * Maps file extensions and language identifiers to human-readable names
 */

const languageMap: Record<string, string> = {
  // JavaScript / TypeScript
  js: "JavaScript",
  jsx: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  mts: "TypeScript",
  cts: "TypeScript",

  // Web
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  vue: "Vue",
  svelte: "Svelte",

  // Python
  py: "Python",
  pyw: "Python",
  pyi: "Python",
  pyx: "Cython",

  // Systems
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  hpp: "C++",
  hxx: "C++",
  rs: "Rust",
  go: "Go",
  zig: "Zig",

  // JVM
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  scala: "Scala",
  groovy: "Groovy",
  clj: "Clojure",
  cljs: "ClojureScript",

  // .NET
  cs: "C#",
  fs: "F#",
  vb: "Visual Basic",

  // Ruby
  rb: "Ruby",
  erb: "ERB",
  rake: "Ruby",

  // PHP
  php: "PHP",

  // Shell
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  fish: "Fish",
  ps1: "PowerShell",
  psm1: "PowerShell",
  bat: "Batch",
  cmd: "Batch",

  // Data / Config
  json: "JSON",
  jsonc: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  ini: "INI",
  env: "Environment",
  properties: "Properties",

  // Markup / Docs
  md: "Markdown",
  mdx: "MDX",
  rst: "reStructuredText",
  tex: "LaTeX",
  txt: "Plain Text",

  // Database
  sql: "SQL",
  prisma: "Prisma",
  graphql: "GraphQL",
  gql: "GraphQL",

  // Mobile
  swift: "Swift",
  m: "Objective-C",
  mm: "Objective-C++",
  dart: "Dart",

  // Functional
  hs: "Haskell",
  lhs: "Haskell",
  ml: "OCaml",
  mli: "OCaml",
  elm: "Elm",
  ex: "Elixir",
  exs: "Elixir",
  erl: "Erlang",
  hrl: "Erlang",

  // Other
  r: "R",
  jl: "Julia",
  lua: "Lua",
  pl: "Perl",
  pm: "Perl",
  nim: "Nim",
  v: "V",
  asm: "Assembly",
  s: "Assembly",
  wasm: "WebAssembly",
  wat: "WebAssembly",

  // Config files
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  cmake: "CMake",
  gradle: "Gradle",

  // Zoekt language identifiers (capitalized)
  JavaScript: "JavaScript",
  TypeScript: "TypeScript",
  TSX: "TypeScript",
  JSX: "JavaScript",
  Python: "Python",
  Go: "Go",
  Rust: "Rust",
  Java: "Java",
  "C++": "C++",
  C: "C",
  "C#": "C#",
  Ruby: "Ruby",
  PHP: "PHP",
  Swift: "Swift",
  Kotlin: "Kotlin",
  Scala: "Scala",
  HTML: "HTML",
  CSS: "CSS",
  SCSS: "SCSS",
  SQL: "SQL",
  Shell: "Shell",
  Bash: "Bash",
  JSON: "JSON",
  YAML: "YAML",
  XML: "XML",
  Markdown: "Markdown",
  Haskell: "Haskell",
  Elixir: "Elixir",
  Erlang: "Erlang",
  Clojure: "Clojure",
  Lua: "Lua",
  Perl: "Perl",
  R: "R",
  Julia: "Julia",
  Dart: "Dart",
  Vue: "Vue",
  Svelte: "Svelte",
  GraphQL: "GraphQL",
  Dockerfile: "Dockerfile",
  Makefile: "Makefile",
  TOML: "TOML",
  INI: "INI",
  Text: "Plain Text",
  text: "Plain Text",
};

/**
 * Get a human-readable language name from an extension or language identifier
 * @param identifier - File extension (with or without dot) or language identifier
 * @returns Human-readable language name, or the original identifier if not found
 */
export function getLanguageName(identifier: string | undefined | null): string {
  if (!identifier) return "";
  
  // Remove leading dot if present
  const clean = identifier.startsWith(".") ? identifier.slice(1) : identifier;
  
  // Try exact match first
  if (languageMap[clean]) {
    return languageMap[clean];
  }
  
  // Try lowercase
  const lower = clean.toLowerCase();
  if (languageMap[lower]) {
    return languageMap[lower];
  }
  
  // Return original if no match (capitalized)
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Get the language name from a filename
 * @param filename - The filename to extract language from
 * @returns Human-readable language name
 */
export function getLanguageFromFilename(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  
  const ext = parts[parts.length - 1];
  return getLanguageName(ext);
}
