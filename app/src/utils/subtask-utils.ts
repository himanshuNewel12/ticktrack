export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

const CHECKLIST_REGEX = /^\s*-\s*\[([ xX])\]\s*(.+)$/;

/**
 * Extracts subtasks formatted as markdown checklist items (`- [ ] item` or `- [x] item`)
 * and returns the list of subtasks along with the clean notes description.
 */
export function extractSubtasksAndNotes(rawNotes: string | null | undefined): {
  subtasks: Subtask[];
  cleanNotes: string;
} {
  if (!rawNotes || typeof rawNotes !== "string") {
    return { subtasks: [], cleanNotes: "" };
  }

  const lines = rawNotes.split("\n");
  const subtasks: Subtask[] = [];
  const nonChecklistLines: string[] = [];

  lines.forEach((line, index) => {
    const match = line.match(CHECKLIST_REGEX);
    if (match) {
      const isCompleted = match[1].toLowerCase() === "x";
      const title = match[2].trim();
      subtasks.push({
        id: `subtask-${index}-${title.slice(0, 10).replace(/\s+/g, "")}`,
        title,
        completed: isCompleted,
      });
    } else {
      nonChecklistLines.push(line);
    }
  });

  // Clean trailing and leading empty lines
  const cleanNotes = nonChecklistLines.join("\n").trim();

  return { subtasks, cleanNotes };
}

/**
 * Re-assembles notes with the given subtasks appended as a clean markdown checklist.
 */
export function serializeNotesWithSubtasks(
  cleanNotes: string,
  subtasks: Subtask[]
): string {
  const parts: string[] = [];
  const trimmed = (cleanNotes || "").trim();
  if (trimmed) {
    parts.push(trimmed);
  }

  if (subtasks && subtasks.length > 0) {
    if (parts.length > 0) {
      parts.push(""); // empty line separation
    }
    subtasks.forEach((item) => {
      if (item.title.trim()) {
        const check = item.completed ? "[x]" : "[ ]";
        parts.push(`- ${check} ${item.title.trim()}`);
      }
    });
  }

  return parts.join("\n");
}
