const { db, nextId } = require('../core/store');
const { Roles, RedemptionStatus } = require('../core/constants');
const { getUser, isLinkedParent } = require('./authService');

function createReward({ parentId, studentId, name, imageUrl, pointCost, description }) {
  const parent = getUser(parentId);
  if (parent.role !== Roles.PARENT) throw new Error('Only parents can create rewards');
  if (!isLinkedParent({ parentId, studentId })) throw new Error('Parent not linked to this student');

  const reward = {
    id: nextId('reward'),
    studentId,
    name,
    imageUrl,
    pointCost,
    description,
    createdByParentId: parentId,
    createdAt: new Date().toISOString(),
  };

  db.rewards.set(reward.id, reward);
  return reward;
}

function redeemReward({ studentId, rewardId }) {
  const student = getUser(studentId);
  if (student.role !== Roles.STUDENT) throw new Error('Only students can redeem rewards');

  const reward = db.rewards.get(rewardId);
  if (!reward || reward.studentId !== studentId) throw new Error('Reward not found');

  if (student.points < reward.pointCost) {
    throw new Error('Not enough points');
  }

  student.points -= reward.pointCost;

  const redemption = {
    id: nextId('redemption'),
    rewardId,
    studentId,
    status: RedemptionStatus.REQUESTED,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    confirmedByParentId: null,
  };

  db.redemptions.set(redemption.id, redemption);
  return redemption;
}

function confirmRewardDelivery({ parentId, redemptionId }) {
  const parent = getUser(parentId);
  if (parent.role !== Roles.PARENT) throw new Error('Only parents can confirm reward delivery');

  const redemption = db.redemptions.get(redemptionId);
  if (!redemption) throw new Error('Redemption not found');

  if (!isLinkedParent({ parentId, studentId: redemption.studentId })) {
    throw new Error('Parent not linked to student');
  }

  redemption.status = RedemptionStatus.CONFIRMED;
  redemption.deliveredAt = new Date().toISOString();
  redemption.confirmedByParentId = parentId;

  return redemption;
}

module.exports = {
  createReward,
  redeemReward,
  confirmRewardDelivery,
};
