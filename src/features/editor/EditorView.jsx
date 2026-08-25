import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView as CodeMirrorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { EditorToolbar } from "./EditorToolbar.jsx";
import { readEditorFile, saveEditorFile } from "./editorApi.js";
import { isObviousBinaryFile } from "./fileTypes.js";
import { languageExtensionForFile } from "./language.js";
import "./editor.css";

const editorTheme = CodeMirrorView.theme({
  "&.cm-focused": { outline: "none" },
  ".cm-content": { caretColor: "#6ee7b7", padding: "0.75rem 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#6ee7b7" },
  ".cm-searchMatch": { backgroundColor: "rgba(245, 158, 11, 0.28)", outline: "1px solid rgba(245, 158, 11, 0.55)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(52, 211, 153, 0.35)" },
  ".cm-panels": { backgroundColor: "#0f172a", color: "#e2e8f0" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid #334155" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": { color: "inherit" },
  ".cm-panel.cm-search input": { backgroundColor: "#020617", border: "1px solid #334155", borderRadius: "4px" }
}, { dark: true });

export default function EditorView({ serverId, entry, onBack, onDirtyChange }) {
  const mountRef = useRef(null);
  const viewRef = useRef(null);
  const savedDocumentRef = useRef(null);
  const saveRef = useRef(null);
  const savingRef = useRef(false);
  const [loaded, setLoaded] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading...");

  const setDirtyState = useCallback((nextDirty) => {
    setDirty(nextDirty);
    onDirtyChange(nextDirty);
  }, [onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError("");
    setStatus("Loading...");
    setDirtyState(false);

    if (isObviousBinaryFile(entry.name)) {
      setLoadError("This file type cannot be edited in the browser.");
      setStatus("Unavailable");
      return () => { cancelled = true; };
    }

    Promise.all([readEditorFile(serverId, entry.path), languageExtensionForFile(entry.name)])
      .then(([content, language]) => {
        if (!cancelled) {
          setLoaded({ content, language });
          setStatus("Ready");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error.status === 413 ? "This file is too large to edit in the browser." : error.message);
          setStatus("Unavailable");
        }
      });

    return () => { cancelled = true; };
  }, [entry.name, entry.path, serverId, setDirtyState]);

  useEffect(() => {
    if (!loaded || !mountRef.current) return undefined;

    const saveKeymap = {
      key: "Mod-s",
      preventDefault: true,
      run: () => {
        void saveRef.current?.();
        return true;
      }
    };
    const state = EditorState.create({
      doc: loaded.content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([saveKeymap, indentWithTab, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
        CodeMirrorView.lineWrapping,
        CodeMirrorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          setDirtyState(!update.state.doc.eq(savedDocumentRef.current));
          setStatus("");
        }),
        editorTheme,
        loaded.language
      ]
    });
    savedDocumentRef.current = state.doc;
    const view = new CodeMirrorView({ state, parent: mountRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [loaded, setDirtyState]);

  const save = useCallback(async () => {
    const view = viewRef.current;
    if (!view || savingRef.current) return;
    const documentAtSave = view.state.doc;
    if (documentAtSave.eq(savedDocumentRef.current)) return;

    savingRef.current = true;
    setSaving(true);
    setStatus("Saving...");
    try {
      await saveEditorFile(serverId, entry.path, documentAtSave.toString());
      savedDocumentRef.current = documentAtSave;
      const newerChangesRemain = !view.state.doc.eq(documentAtSave);
      setDirtyState(newerChangesRemain);
      setStatus(newerChangesRemain ? "Saved; newer changes remain" : "Saved");
    } catch (error) {
      setStatus(error.message || "Save failed");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [entry.path, serverId, setDirtyState]);

  saveRef.current = save;

  useEffect(() => {
    if (!dirty) return undefined;
    const protectUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => window.removeEventListener("beforeunload", protectUnload);
  }, [dirty]);

  return (
    <section className="editor-shell" aria-label={`Editing ${entry.name}`}>
      <EditorToolbar
        filename={entry.name}
        path={entry.path}
        dirty={dirty}
        saving={saving}
        status={status}
        onBack={onBack}
        onSave={save}
        onUndo={() => viewRef.current && undo(viewRef.current)}
        onRedo={() => viewRef.current && redo(viewRef.current)}
        onSearch={() => viewRef.current && openSearchPanel(viewRef.current)}
      />
      {loadError ? <div className="editor-message text-rose-200" role="alert">{loadError}</div> : loaded ? <div ref={mountRef} className="editor-mount" /> : <div className="editor-message">Loading file...</div>}
    </section>
  );
}
