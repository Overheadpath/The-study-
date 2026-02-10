/**
 * In-memory store for demo and architecture scaffolding.
 * Swap with SQLite/Postgres/Firebase later.
 */
const db = {
  users: new Map(),
  parentChildLinks: new Map(), // studentId -> Set(parentIds)
  tasks: new Map(),
  approvalLogs: [],
  rewards: new Map(),
  redemptions: new Map(),
};

let id = 0;
function nextId(prefix) {
  id += 1;
  return `${prefix}_${id}`;
}

module.exports = { db, nextId };
