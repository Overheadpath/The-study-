const encouragements = [
  'Nice one. You earned points.',
  'Approved ✅ Keep the streak alive.',
  'Yo, well done. You actually finished this.',
  'Streak is alive 🔥 Keep going.',
];

function buildApprovalMessage({ points }) {
  const random = encouragements[Math.floor(Math.random() * encouragements.length)];
  return `${random} +${points} points.`;
}

function buildStreakMessage({ streakDays }) {
  return `Day ${streakDays} locked in. Small wins add up 💪`;
}

module.exports = {
  buildApprovalMessage,
  buildStreakMessage,
};
