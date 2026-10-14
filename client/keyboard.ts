/** Web-oriented key event shape (RN TextInput forwards these on web). */
export type WebKeyDownEvent = {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
};

export function isSaveChord(event: WebKeyDownEvent): boolean {
  return event.key === "Enter" && Boolean(event.ctrlKey || event.metaKey);
}

/** Props to spread onto TextInput so Ctrl/Cmd+Enter saves. */
export function saveOnCtrlEnterProps(onSave: () => void): Record<string, unknown> {
  return {
    onKeyDown: (event: WebKeyDownEvent) => {
      if (!isSaveChord(event)) return;
      event.preventDefault?.();
      onSave();
    },
  };
}
