import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getDiffContext } from "./server/context";
import { discardPath } from "./server/discard";
import { getDiffHunks } from "./server/hunks";
import { getDiffSnapshot } from "./server/snapshot";
import { stagePaths } from "./server/stage";
import {
  diffContextRpc,
  diffDiscardRpc,
  diffHunksRpc,
  diffSnapshotRpc,
  diffStageRpc,
} from "./shared/rpc";
import { reviewSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(reviewSettings);
  server.handle(diffSnapshotRpc, async (input) => {
    const state = await settings.read();
    // Invalid stored settings fall back to the defaults (both discovery sources on).
    const nestedRepos = state.status === "ready" ? state.values.nestedRepos : undefined;
    return getDiffSnapshot(input, nestedRepos);
  });
  server.handle(diffHunksRpc, getDiffHunks);
  server.handle(diffContextRpc, getDiffContext);
  server.handle(diffStageRpc, stagePaths);
  server.handle(diffDiscardRpc, discardPath);
  return () => {};
}
