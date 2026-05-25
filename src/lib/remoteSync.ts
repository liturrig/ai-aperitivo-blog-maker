import {
  DEFAULT_GITHUB_OWNER,
  DEFAULT_GITHUB_REPO,
  DEFAULT_GITHUB_SYNC_LABEL,
  GitHubSyncConflictError,
  buildGitHubIssueUrl,
  loadGitHubSyncSettings,
  refreshProjectFromGitHub,
  saveGitHubSyncSettings,
  syncProjectToGitHub,
  type GitHubSyncSettings,
} from "./githubSync";
import type { ProjectSnapshot } from "./storage";

export type RemoteStorageSettings = {
  accessKey: string;
};

export { GitHubSyncConflictError as RemoteStorageConflictError };

export function loadRemoteStorageSettings(): RemoteStorageSettings {
  const settings = loadGitHubSyncSettings();
  return {
    accessKey: settings.token,
  };
}

export function saveRemoteStorageSettings(settings: RemoteStorageSettings): RemoteStorageSettings {
  const current = loadGitHubSyncSettings();
  saveGitHubSyncSettings({
    ...current,
    token: settings.accessKey,
  });
  return {
    accessKey: settings.accessKey.trim(),
  };
}

export function isRemoteStorageReady(settings: RemoteStorageSettings): boolean {
  return Boolean(settings.accessKey.trim());
}

export function buildRemoteRecordUrl(settings: RemoteStorageSettings, remoteId?: string | null): string | null {
  const providerSettings = toProviderSettings(settings);
  return buildGitHubIssueUrl(providerSettings, remoteId);
}

export async function syncProjectToRemote(
  settings: RemoteStorageSettings,
  userId: string,
  snapshot: ProjectSnapshot
) {
  return syncProjectToGitHub(toProviderSettings(settings), userId, snapshot);
}

export async function refreshProjectFromRemote(
  settings: RemoteStorageSettings,
  userId: string,
  projectId: string,
  sourceUrl: string,
  remoteId?: string | null
) {
  return refreshProjectFromGitHub(toProviderSettings(settings), projectId, sourceUrl, userId, remoteId);
}

function toProviderSettings(settings: RemoteStorageSettings): GitHubSyncSettings {
  const current = loadGitHubSyncSettings();
  return {
    owner: current.owner || DEFAULT_GITHUB_OWNER,
    repo: current.repo || DEFAULT_GITHUB_REPO,
    label: current.label || DEFAULT_GITHUB_SYNC_LABEL,
    token: settings.accessKey.trim(),
  };
}
