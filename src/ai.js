/**
 * Lightweight, supportive response helper.
 */
export class FriendlyAiService {
  generateApprovalMessage({ points }) {
    const options = [
      `Nice one. You earned ${points} points.`,
      `Approved ✅ +${points} points. Keep the streak alive.`,
      `Yo, well done. That task is done and counted (+${points}).`,
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  generateStreakMessage({ streakDays }) {
    return streakDays > 1
      ? `Streak is alive 🔥 ${streakDays} days strong.`
      : "Great start. Day 1 on the board ✅";
  }
}
