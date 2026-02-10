# Verified Learning Loop

Simple reference implementation of your 4-step loop:

1. Student creates and submits homework proof.
2. Task moves to pending approval.
3. Parent approves with biometric auth (OS-managed Face ID / fingerprint).
4. Points are awarded, AI sends encouragement, rewards can be redeemed.

## Project structure

- `src/models.js` – roles, task statuses, redemption statuses.
- `src/auth.js` – user registration, parent-child linking, role checks.
- `src/homework.js` – task create/submit/reject and parent review list.
- `src/biometric.js` – biometric adapter wrapper (success/fail only, no biometric storage).
- `src/approval.js` – secure approval flow, duplicate protection, point award, audit logs.
- `src/rewards.js` – parent-managed rewards and delivery confirmation.
- `src/ai.js` – friendly short encouragement messages.
- `src/index.js` – app factory/wiring.
- `test/system.test.js` – system behavior tests.

## Run tests

```bash
npm test
```

## Notes on real mobile biometrics

In production mobile apps, call standard OS APIs:

- iOS: LocalAuthentication (Face ID / Touch ID)
- Android: BiometricPrompt
- React Native: `expo-local-authentication` or `react-native-biometrics`

The app never receives raw fingerprint/face data. It only receives success/failure.
