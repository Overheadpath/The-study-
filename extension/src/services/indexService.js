const { STORAGE_KEYS } = require('../core/constants');
const { appendToLog, read, write } = require('./storageService');

function buildMissingBrainrots({ detectedBrainrots, ownedBrainrotIds }) {
  const ownedSet = new Set(ownedBrainrotIds || []);
  return (detectedBrainrots || []).filter((brainrot) => !ownedSet.has(brainrot.id));
}

async function upsertSessionScan({ serverId, players, detectedBrainrots, accessSignals }) {
  const snapshot = {
    serverId,
    players: players || [],
    detectedBrainrots: detectedBrainrots || [],
    accessSignals: accessSignals || [],
    scannedAt: new Date().toISOString(),
  };

  await write(STORAGE_KEYS.SESSION_SCAN, snapshot);
  await appendToLog({
    type: 'SESSION_SCAN_UPSERTED',
    payload: {
      serverId,
      playerCount: snapshot.players.length,
      brainrotCount: snapshot.detectedBrainrots.length,
    },
  });

  return snapshot;
}

async function updateBrainrotIndex({ ownedBrainrotIds, detectedBrainrots }) {
  const missing = buildMissingBrainrots({ detectedBrainrots, ownedBrainrotIds });
  const index = {
    ownedBrainrotIds: ownedBrainrotIds || [],
    detectedBrainrots: detectedBrainrots || [],
    missingBrainrots: missing,
    updatedAt: new Date().toISOString(),
  };

  await write(STORAGE_KEYS.BRAINROT_INDEX, index);
  await appendToLog({
    type: 'BRAINROT_INDEX_UPDATED',
    payload: {
      ownedCount: index.ownedBrainrotIds.length,
      detectedCount: index.detectedBrainrots.length,
      missingCount: index.missingBrainrots.length,
    },
  });

  return index;
}

async function updateFriendIndex({ relationships, privateServerAccessGivers }) {
  const relationshipRows = relationships || [];
  const accessSet = new Set(privateServerAccessGivers || []);

  const friendRows = relationshipRows.map((row) => ({
    userId: row.userId,
    username: row.username,
    isMutual: Boolean(row.isMutual),
    givesPrivateServerAccess: accessSet.has(row.userId),
  }));

  const index = {
    rows: friendRows,
    updatedAt: new Date().toISOString(),
  };

  await write(STORAGE_KEYS.FRIEND_INDEX, index);
  await appendToLog({
    type: 'FRIEND_INDEX_UPDATED',
    payload: {
      friendCount: friendRows.length,
      accessGiverCount: friendRows.filter((row) => row.givesPrivateServerAccess).length,
    },
  });

  return index;
}

async function getIndexes() {
  const [brainrotIndex, friendIndex, sessionScan] = await Promise.all([
    read(STORAGE_KEYS.BRAINROT_INDEX, null),
    read(STORAGE_KEYS.FRIEND_INDEX, null),
    read(STORAGE_KEYS.SESSION_SCAN, null),
  ]);

  return {
    brainrotIndex,
    friendIndex,
    sessionScan,
  };
}

module.exports = {
  buildMissingBrainrots,
  getIndexes,
  updateBrainrotIndex,
  updateFriendIndex,
  upsertSessionScan,
};
