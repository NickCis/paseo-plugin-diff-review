import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsAction, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { DEFAULT_PROMPT_TEMPLATE, reviewSettings } from "../shared/settings";

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
  return <PromptEditor settings={settings} theme={theme} />;
}
