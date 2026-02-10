import { RedemptionStatus, Role } from "./models.js";

/**
 * Rewards are parent-defined and redeemed with approved points.
 */
export class RewardService {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
  }

  createReward({ parentId, name, image, pointCost, description }) {
    this.auth.ensureParent(parentId);
    return this.store.createReward({ parentId, name, image, pointCost, description });
  }

  redeemReward({ studentId, rewardId }) {
    const student = this.auth.ensureStudent(studentId);
    const reward = this.store.rewards.get(rewardId);
    if (!reward) {
      throw new Error("Reward not found.");
    }
    if (student.points < reward.pointCost) {
      throw new Error("Not enough points.");
    }

    student.points -= reward.pointCost;
    return this.store.createRedemption({ studentId, rewardId });
  }

  confirmDelivery({ parentId, redemptionId }) {
    this.auth.ensureParent(parentId);
    const redemption = this.store.redemptions.get(redemptionId);
    if (!redemption) {
      throw new Error("Redemption not found.");
    }
    const reward = this.store.rewards.get(redemption.rewardId);

    if (reward.parentId !== parentId) {
      throw new Error("Only the reward owner parent can confirm delivery.");
    }
    if (redemption.status === RedemptionStatus.DELIVERED) {
      throw new Error("Reward already marked as delivered.");
    }

    redemption.status = RedemptionStatus.DELIVERED;
    redemption.deliveredBy = parentId;
    redemption.deliveredAt = new Date().toISOString();
    return redemption;
  }

  // Optional helper for UI role enforcement checks.
  canEditPoints(userId) {
    const user = this.store.users.get(userId);
    return user?.role === Role.PARENT;
  }
}
