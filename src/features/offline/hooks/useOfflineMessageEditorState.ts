import { useState } from "react";

export function useOfflineMessageEditorState() {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  return { editingMessageId, setEditingMessageId, editingText, setEditingText };
}
