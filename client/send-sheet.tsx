import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { usePaseo, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, Modal } from "@getpaseo/plugin/client/react-native";

export interface AgentChoice {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  sortKey: string;
}

interface SendSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  workspaceId: string;
  theme: PluginSurfaceProps["theme"];
  sending: boolean;
  onSend(
    target: { kind: "existing"; agentId: string } | { kind: "create"; agentId?: string },
  ): void;
}

function compareNewestFirst(left: AgentChoice, right: AgentChoice): number {
  if (left.sortKey < right.sortKey) return 1;
  if (left.sortKey > right.sortKey) return -1;
  return 0;
}

function AgentRow({
  label,
  detail,
  selected,
  theme,
  value,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  theme: PluginSurfaceProps["theme"];
  value: string;
  onSelect(value: string): void;
}) {
  const styles = useMemo(
    () => ({
      row: {
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      rowText: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
    }),
    [selected, theme],
  );
  const press = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <Pressable accessibilityRole="button" onPress={press} style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Text style={styles.muted}>{detail}</Text>
    </Pressable>
  );
}

export function SendSheet({
  open,
  onOpenChange,
  workspaceId,
  theme,
  sending,
  onSend,
}: SendSheetProps) {
  const paseo = usePaseo();
  const [agents, setAgents] = useState<AgentChoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await paseo.agents.list();
        if (cancelled) return;
        const choices = page.entries
          .map(({ agent }) => agent)
          .filter((agent) => agent.workspaceId === workspaceId)
          .map((agent) => ({
            id: agent.id,
            title: agent.title?.trim() || agent.id,
            provider: agent.provider,
            model: agent.model,
            sortKey: agent.lastUserMessageAt ?? agent.updatedAt,
          }))
          .sort(compareNewestFirst);
        setAgents(choices);
        setSelectedId(choices[0]?.id ?? "new");
        setError(null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, paseo, workspaceId]);

  const styles = useMemo(
    () => ({
      body: { gap: 10, paddingBottom: 8 },
      title: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      button: {
        marginTop: 8,
        padding: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
        alignItems: "center" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );

  const selectId = useCallback((value: string) => setSelectedId(value), []);
  const confirm = useCallback(() => {
    if (selectedId === "new") {
      onSend({ kind: "create", agentId: agents[0]?.id });
      return;
    }
    if (selectedId) onSend({ kind: "existing", agentId: selectedId });
  }, [agents, onSend, selectedId]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Send review"
      icon={<Icon name="Send" size={18} color={theme.colors.foreground} />}
    >
      <Modal.Content>
        <View style={styles.body}>
          <Text style={styles.title}>Choose an agent</Text>
          <Text style={styles.muted}>
            Default is the most recently active agent in this workspace.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              label={agent.title}
              detail={`${agent.provider}${agent.model ? `/${agent.model}` : ""}`}
              selected={selectedId === agent.id}
              theme={theme}
              value={agent.id}
              onSelect={selectId}
            />
          ))}
          <AgentRow
            label="Create new agent"
            detail="Uses the recent agent’s provider/model when available."
            selected={selectedId === "new"}
            theme={theme}
            value="new"
            onSelect={selectId}
          />
          <Pressable
            accessibilityRole="button"
            disabled={sending || selectedId == null}
            onPress={confirm}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{sending ? "Sending…" : "Send review"}</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
