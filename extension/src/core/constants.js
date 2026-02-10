const DEFAULT_SETTINGS = Object.freeze({
  autoRefreshEnabled: true,
  refreshIntervalSeconds: 45,
  notifyOnMissingBrainrot: true,
  musicEnabled: false,
  maxBulkActionsPerRun: 15,
  minBulkActionDelayMs: 900,
  dryRunByDefault: true,
});

const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'beaniePro.settings',
  BRAINROT_INDEX: 'beaniePro.brainrotIndex',
  FRIEND_INDEX: 'beaniePro.friendIndex',
  SESSION_SCAN: 'beaniePro.sessionScan',
  ACTIVITY_LOG: 'beaniePro.activityLog',
});

const MESSAGE_TYPES = Object.freeze({
  UPSERT_SESSION_SCAN: 'UPSERT_SESSION_SCAN',
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_INDEXES: 'GET_INDEXES',
  GET_STATUS: 'GET_STATUS',
});

module.exports = {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  MESSAGE_TYPES,
};
