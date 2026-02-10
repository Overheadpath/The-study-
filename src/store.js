import { TaskStatus, RedemptionStatus } from "./models.js";

/**
 * Very small in-memory data store for readability.
 * In production, replace with a database layer.
 */
export class InMemoryStore {
  constructor() {
    this.users = new Map();
    this.parentChildLinks = new Map(); // childId -> Set(parentId)
    this.tasks = new Map();
    this.rewards = new Map();
    this.redemptions = new Map();
    this.approvalLogs = [];
    this.counters = { task: 1, reward: 1, redemption: 1 };
  }

  addUser(user) {
    this.users.set(user.id, { ...user, points: user.points ?? 0 });
    return this.users.get(user.id);
  }

  linkParentToChild(parentId, childId) {
    const current = this.parentChildLinks.get(childId) ?? new Set();
    current.add(parentId);
    this.parentChildLinks.set(childId, current);
  }

  createTask({ studentId, subject, description, rewardPoints }) {
    const id = `task_${this.counters.task++}`;
    const task = {
      id,
      studentId,
      subject,
      description,
      rewardPoints,
      proof: null,
      status: TaskStatus.CREATED,
      approvedBy: null,
      approvedAt: null,
    };
    this.tasks.set(id, task);
    return task;
  }

  createReward({ parentId, name, image, pointCost, description }) {
    const id = `reward_${this.counters.reward++}`;
    const reward = { id, parentId, name, image, pointCost, description };
    this.rewards.set(id, reward);
    return reward;
  }

  createRedemption({ studentId, rewardId }) {
    const id = `redeem_${this.counters.redemption++}`;
    const redemption = {
      id,
      studentId,
      rewardId,
      status: RedemptionStatus.REQUESTED,
      deliveredBy: null,
      deliveredAt: null,
    };
    this.redemptions.set(id, redemption);
    return redemption;
  }
}
