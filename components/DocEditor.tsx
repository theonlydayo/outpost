"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import type { Block } from "@blocknote/core";
import { saveDocContent } from "@/actions/doc";
import type { Prisma } from "@/lib/generated/prisma/client";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { outpostDarkTheme } from "@/lib/blocknote-theme";

const SAVE_DEBOUNCE_MS = 1000;

type DocEditorProps = {
  workspaceId: string;
  initialContent: Block[] | null;
};

export function DocEditor({
  workspaceId,
  initialContent,
}: DocEditorProps) {
  const editor = useCreateBlockNote({
    initialContent: initialContent ?? undefined,
  });

  const { setDocEditor } = useWorkspaceEditors();

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const latestContent = useRef<Prisma.InputJsonValue>(
    JSON.parse(JSON.stringify(editor.document)) as Prisma.InputJsonValue
  );

  // Publish the editor so the Share dialog can export its content.
  useEffect(() => {
    setDocEditor(editor);

    return () => setDocEditor(null);
  }, [editor, setDocEditor]);

  // Save document content after the user stops typing.
  const handleChange = useCallback(() => {
    latestContent.current = JSON.parse(
      JSON.stringify(editor.document)
    ) as Prisma.InputJsonValue;

    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }

    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null;

      void saveDocContent(workspaceId, latestContent.current).catch(
        (error) => {
          console.error("Failed to save document:", error);
        }
      );
    }, SAVE_DEBOUNCE_MS);
  }, [editor, workspaceId]);

  // Flush any pending save when leaving the page.
  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;

        void saveDocContent(workspaceId, latestContent.current).catch(
          (error) => {
            console.error("Failed to save document:", error);
          }
        );
      }
    };
  }, [workspaceId]);

  return (
    <div className="h-full overflow-y-auto pt-6">
      <BlockNoteView
        editor={editor}
        theme={outpostDarkTheme}
        onChange={handleChange}
      />
    </div>
  );
}
