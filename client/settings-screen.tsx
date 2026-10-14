import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import {
  DEFAULT_DIFF_FONT_FAMILY,
  DEFAULT_DIFF_FONT_SIZE,
  DEFAULT_DIFF_LINE_HEIGHT,
  DEFAULT_PROMPT_TEMPLATE,
  reviewSettings,
  type DiffTypography,
  type ReviewSettingsValues,
} from "../shared/settings";

type ReadySettings = Extract<SettingsState<typeof reviewSettings.schema>, { status: "ready" }>;

function PromptEditor({
  settings,
  theme,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const [promptTemplate, setPromptTemplate] = useState(settings.values.promptTemplate);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) setPromptTemplate(settings.values.promptTemplate);
  }, [dirty, settings.values.promptTemplate]);

  const styles = useMemo(
    () => ({
      input: {
        minHeight: 220,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
        color: theme.colors.foreground,
        textAlignVertical: "top" as const,
        fontFamily: "monospace",
        fontSize: 13,
      },
      help: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 8 },
      error: { color: theme.colors.statusDanger, marginTop: 8 },
    }),
    [theme],
  );

  const onChangeTemplate = useCallback((next: string) => {
    setDirty(true);
    setLocalError(null);
    setPromptTemplate(next);
  }, []);

  const save = useCallback(async () => {
    setLocalError(null);
    // Merge only the template onto the latest values so progress writes don't conflict.
    const ok = await settings.save(
      {
        ...settings.values,
        promptTemplate,
      },
      settings.revision,
    );
    if (!ok) {
      setLocalError(settings.saveError ?? "Could not save prompt template");
      return;
    }
    setDirty(false);
  }, [promptTemplate, settings]);

  const resetTemplate = useCallback(() => {
    setDirty(true);
    setLocalError(null);
    setPromptTemplate(DEFAULT_PROMPT_TEMPLATE);
  }, []);

  const error = localError ?? settings.saveError;

  return (
    <SettingsSection title="Review prompt">
      <SettingsCard>
        <TextInput
          multiline
          value={promptTemplate}
          onChangeText={onChangeTemplate}
          style={styles.input}
        />
        <Text style={styles.help}>
          Placeholders: {"{{workspace}}"}, {"{{seenCount}}"} (viewed files), {"{{totalCount}}"},{" "}
          {"{{ignoredCount}}"}, {"{{comments}}"}, {"{{seenUncommented}}"}, {"{{seenFiles}}"}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <SettingsAction
          label="Prompt template"
          actionLabel={settings.saving ? "Saving…" : "Save"}
          disabled={settings.saving}
          onPress={() => void save()}
        />
        <SettingsAction
          label="Restore default template"
          actionLabel="Reset template"
          disabled={settings.saving}
          onPress={resetTemplate}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function parsePositiveNumber(text: string, fallback: number): number {
  const parsed = Number(text.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function TypographyEditor({
  settings,
  theme,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const current = settings.values.diffTypography;
  const [fontSizeText, setFontSizeText] = useState(String(current.fontSize));
  const [lineHeightText, setLineHeightText] = useState(String(current.lineHeight));
  const [fontFamily, setFontFamily] = useState(current.fontFamily);
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (dirty) return;
    const next = settings.values.diffTypography;
    setFontSizeText(String(next.fontSize));
    setLineHeightText(String(next.lineHeight));
    setFontFamily(next.fontFamily);
  }, [dirty, settings.values.diffTypography]);

  const styles = useMemo(
    () => ({
      error: { color: theme.colors.statusDanger, marginTop: 8 },
      help: { color: theme.colors.foregroundMuted, fontSize: 12, marginBottom: 8 },
    }),
    [theme],
  );

  const markDirty = useCallback(() => {
    setDirty(true);
    setLocalError(null);
  }, []);

  const onFontSize = useCallback(
    (text: string) => {
      markDirty();
      setFontSizeText(text);
    },
    [markDirty],
  );
  const onLineHeight = useCallback(
    (text: string) => {
      markDirty();
      setLineHeightText(text);
    },
    [markDirty],
  );
  const onFontFamily = useCallback(
    (text: string) => {
      markDirty();
      setFontFamily(text);
    },
    [markDirty],
  );

  const remountWith = useCallback((next: DiffTypography) => {
    setFontSizeText(String(next.fontSize));
    setLineHeightText(String(next.lineHeight));
    setFontFamily(next.fontFamily);
    setFormKey((key) => key + 1);
  }, []);

  const save = useCallback(async () => {
    setLocalError(null);
    const next: DiffTypography = {
      fontSize: parsePositiveNumber(fontSizeText, DEFAULT_DIFF_FONT_SIZE),
      lineHeight: parsePositiveNumber(lineHeightText, DEFAULT_DIFF_LINE_HEIGHT),
      fontFamily: fontFamily.trim() || DEFAULT_DIFF_FONT_FAMILY,
    };
    const ok = await settings.save(
      {
        ...settings.values,
        diffTypography: next,
      } satisfies ReviewSettingsValues,
      settings.revision,
    );
    if (!ok) {
      setLocalError(settings.saveError ?? "Could not save diff typography");
      return;
    }
    remountWith(next);
    setDirty(false);
  }, [fontFamily, fontSizeText, lineHeightText, remountWith, settings]);

  const reset = useCallback(() => {
    markDirty();
    remountWith({
      fontSize: DEFAULT_DIFF_FONT_SIZE,
      lineHeight: DEFAULT_DIFF_LINE_HEIGHT,
      fontFamily: DEFAULT_DIFF_FONT_FAMILY,
    });
  }, [markDirty, remountWith]);

  const error = localError ?? settings.saveError;
  const inputKey = `${settings.revision}:${formKey}`;

  return (
    <SettingsSection title="Diff typography">
      <SettingsCard>
        <Text style={styles.help}>
          Controls monospace size for line numbers, markers, and code in the diff panel. Defaults
          keep gutters and content the same size.
        </Text>
        <SettingsInput
          key={`fontSize-${inputKey}`}
          label="Font size"
          hint="Pixels (default 12)"
          initialValue={fontSizeText}
          onChangeText={onFontSize}
          placeholder={String(DEFAULT_DIFF_FONT_SIZE)}
        />
        <SettingsInput
          key={`lineHeight-${inputKey}`}
          label="Line height"
          hint="Pixels (default 18)"
          initialValue={lineHeightText}
          onChangeText={onLineHeight}
          placeholder={String(DEFAULT_DIFF_LINE_HEIGHT)}
        />
        <SettingsInput
          key={`fontFamily-${inputKey}`}
          label="Font family"
          hint='CSS/RN font family (default "monospace")'
          initialValue={fontFamily}
          onChangeText={onFontFamily}
          placeholder={DEFAULT_DIFF_FONT_FAMILY}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <SettingsAction
          label="Diff typography"
          actionLabel={settings.saving ? "Saving…" : "Save"}
          disabled={settings.saving || !dirty}
          onPress={() => void save()}
        />
        <SettingsAction
          label="Restore default typography"
          actionLabel="Reset"
          disabled={settings.saving}
          onPress={reset}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function DiffReviewSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(reviewSettings);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") {
    return <Text style={style}>Loading settings…</Text>;
  }
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="Diff Review">
        <Text style={style}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction label="Restore defaults" actionLabel="Reset" onPress={settings.reset} />
        ) : null}
      </SettingsSection>
    );
  }
  return (
    <>
      <PromptEditor settings={settings} theme={theme} />
      <TypographyEditor settings={settings} theme={theme} />
    </>
  );
}
