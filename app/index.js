const { registerUser, linkParentToStudent } = require('./services/authService');
const { createTask, submitTaskProof } = require('./services/taskService');
const { approveTask } = require('./services/approvalService');
const { createReward, redeemReward, confirmRewardDelivery } = require('./services/rewardService');

async function demoVerifiedLearningLoop() {
  const student = registerUser({ name: 'Student A', role: 'student' });
  const parent = registerUser({ name: 'Parent A', role: 'parent' });
  linkParentToStudent({ parentId: parent.id, studentId: student.id });

  const task = createTask({
    studentId: student.id,
    subject: 'Maths',
    description: 'Complete algebra worksheet',
    rewardValue: 50,
  });

  submitTaskProof({
    studentId: student.id,
    taskId: task.id,
    proof: {
      text: 'Finished all 20 questions.',
      imageUrl: 'proof-photo-placeholder.jpg',
    },
  });

  const approved = await approveTask({
    parentId: parent.id,
    taskId: task.id,
    // Replace with real OS biometric API call in mobile app.
    nativeBiometricAuth: async () => ({ success: true }),
  });

  const reward = createReward({
    parentId: parent.id,
    studentId: student.id,
    name: 'Pokémon Booster Pack',
    imageUrl: 'pokemon-pack.jpg',
    pointCost: 40,
    description: 'One booster pack from local game store.',
  });

  const redemption = redeemReward({ studentId: student.id, rewardId: reward.id });
  const delivered = confirmRewardDelivery({ parentId: parent.id, redemptionId: redemption.id });

  return {
    student,
    parent,
    task: approved.task,
    aiMessage: approved.aiMessage,
    reward,
    redemption: delivered,
  };
}

if (require.main === module) {
  demoVerifiedLearningLoop()
    .then((output) => {
      console.log(JSON.stringify(output, null, 2));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { demoVerifiedLearningLoop };
