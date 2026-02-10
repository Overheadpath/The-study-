import { InMemoryStore } from "./store.js";
import { AuthService } from "./auth.js";
import { HomeworkService } from "./homework.js";
import { BiometricService } from "./biometric.js";
import { ApprovalService } from "./approval.js";
import { RewardService } from "./rewards.js";
import { FriendlyAiService } from "./ai.js";

/**
 * Factory to bootstrap the Verified Learning Loop services.
 */
export function createApp({ biometricAuthenticator } = {}) {
  const store = new InMemoryStore();
  const auth = new AuthService(store);
  const ai = new FriendlyAiService();
  const biometric = new BiometricService({ authenticator: biometricAuthenticator });

  return {
    store,
    auth,
    homework: new HomeworkService(store, auth),
    approval: new ApprovalService(store, auth, biometric, ai),
    rewards: new RewardService(store, auth),
    ai,
  };
}
