type ShortcutCommand = {
  id: string;
  description: string;
  keys: string[];
};

export const COMMANDS: ShortcutCommand[] = [
  {
    id: "toggleDirectoryPanel",
    description: "Show/hide the current repo directory mirror",
    keys: ["⌘", "\\"],
  },
  {
    id: "toggleShortcutPanel",
    description: "Open the keyboard shortcuts reference",
    keys: ["⌘", "/"],
  },
];

export function matchesShortcut(event: KeyboardEvent, keys: string[]): boolean {
  const isMeta = event.metaKey || event.ctrlKey;
  if (!isMeta) return false;

  const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return keys.some((candidate) => candidate.length === 1
    ? candidate.toLowerCase() === normalizedKey
    : candidate === event.key
  );
}
