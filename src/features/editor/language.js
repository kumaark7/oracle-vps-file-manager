import { StreamLanguage } from "@codemirror/language";
import { languageKeyForFilename } from "./fileTypes.js";

export async function languageExtensionForFile(filename) {
  const language = languageKeyForFilename(filename);

  if (["javascript", "jsx", "typescript", "tsx"].includes(language)) {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({
      jsx: language === "jsx" || language === "tsx",
      typescript: language === "typescript" || language === "tsx"
    });
  }
  if (language === "json") return (await import("@codemirror/lang-json")).json();
  if (language === "html") return (await import("@codemirror/lang-html")).html();
  if (language === "css") return (await import("@codemirror/lang-css")).css();
  if (language === "python") return (await import("@codemirror/lang-python")).python();
  if (language === "markdown") return (await import("@codemirror/lang-markdown")).markdown();
  if (language === "xml") return (await import("@codemirror/lang-xml")).xml();
  if (language === "yaml") return (await import("@codemirror/lang-yaml")).yaml();
  if (language === "sql") return (await import("@codemirror/lang-sql")).sql();
  if (language === "shell") {
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return StreamLanguage.define(shell);
  }
  return [];
}

