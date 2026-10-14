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
  server.registerSettings(reviewSettings);
  server.handle(diffSnapshotRpc, getDiffSnapshot);
  server.handle(diffHunksRpc, getDiffHunks);
  server.handle(diffContextRpc, getDiffContext);
  server.handle(diffStageRpc, stagePaths);
  server.handle(diffDiscardRpc, discardPath);
  return () => {};
}
