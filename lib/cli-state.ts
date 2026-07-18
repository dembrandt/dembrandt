/**
 * Tiny persistent CLI state, used only to stop one-time hints from repeating.
 *
 * Deliberately not telemetry: nothing is sent anywhere and nothing identifying
 * is stored — the file holds counters for hints already shown on this machine,
 * the same shape as update-notifier's configstore. Stored under XDG_CONFIG_HOME
 * (falling back to ~/.config) so it never lands in the home directory root.
 *
 * Every operation fails silent. A read-only HOME, a sandboxed CI runner or an
 * unwritable config dir must degrade to "show the hint again", never to a
 * failed extraction.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/** Times the cloud hint is shown before going quiet permanently. */
const CLOUD_HINT_LIMIT = 3;

interface CliState {
  cloudHintShown?: number;
}

function stateDir(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "dembrandt");
}

function statePath(): string {
  return join(stateDir(), "state.json");
}

function readState(): CliState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(next: CliState): void {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(statePath(), JSON.stringify(next, null, 2));
  } catch {
    /* unwritable config dir — the hint simply repeats, nothing breaks */
  }
}

/**
 * True at most CLOUD_HINT_LIMIT times per machine, incrementing on each true.
 * Silenced by DEMBRANDT_NO_HINTS and by CI, so pipeline logs stay clean and a
 * CI runner with a fresh HOME never burns the budget meant for a human.
 */
export function consumeCloudHint(): boolean {
  if (process.env.DEMBRANDT_NO_HINTS || process.env.CI) return false;

  const state = readState();
  const shown = typeof state.cloudHintShown === "number" ? state.cloudHintShown : 0;
  if (shown >= CLOUD_HINT_LIMIT) return false;

  writeState({ ...state, cloudHintShown: shown + 1 });
  return true;
}
