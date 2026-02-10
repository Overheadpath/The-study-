# Verified Learning Loop (Student + Parent Approval)

This repository contains a **simple, practical mobile-ready backend/domain architecture** for your system:

1. Student creates task.
2. Student submits proof.
3. Parent approves with biometric authentication (Face ID / fingerprint through OS APIs).
4. Points are awarded and rewards can be redeemed.

> The app never stores biometric data. It only receives success/failure from the device OS.

## Project Structure

- `app/core/constants.js` — roles, task statuses, redemption statuses.
- `app/core/store.js` — in-memory data store + ID generator.
- `app/services/authService.js` — users, role checks, parent-child linking.
- `app/services/taskService.js` — task creation, proof submission, task retrieval.
- `app/services/biometricAdapter.js` — wrapper for native biometric APIs.
- `app/services/approvalService.js` — parent biometric approval, points awarding, logs.
- `app/services/rewardService.js` — reward creation, redemption, delivery confirmation.
- `app/services/aiService.js` — lightweight friendly AI responses.
- `app/services/securityService.js` — explicit guard rules.
- `app/index.js` — executable end-to-end demo flow.

## Role Rules

- Students can create tasks and submit proof.
- Students cannot approve tasks.
- Parents must be linked to student before approving.
- Parent approval requires biometric success.
- Duplicate approvals are blocked.

## Task Status Flow

`created -> submitted -> pending_approval -> approved/rejected`

In this reference implementation, after proof upload the task goes straight to `pending_approval`.

## Biometric Integration (Mobile)

Use device-level APIs only:

- iOS: Face ID / Touch ID via `LAContext`
- Android: Fingerprint/Face via `BiometricPrompt`
- React Native/Expo equivalent wrappers are supported through `nativeBiometricAuth`

Example callback shape expected by `approveTask`:

```js
nativeBiometricAuth: async () => ({ success: true });
```

## Run the demo

```bash
node app/index.js
```

You should see JSON output containing:

- approved task
- student points update
- AI encouragement message
- reward redemption + parent delivery confirmation

## Notes for Production

- Replace in-memory store with real DB.
- Add authentication tokens/session management.
- Add push notifications for parent approvals.
- Add image upload storage (S3/Firebase/etc.).

## Beanie Pro extension scaffold (Phase 0)

This repository now includes a Roblox quality-of-life extension scaffold in `extension/` named **Beanie Pro**.

Phase 0 currently provides:

- MV3 manifest + background/content wiring
- Non-invasive session heartbeat storage
- Settings validation + persistence
- Popup UI for settings and runtime status
- Index service primitives (brainrot/friend/session)

See `docs/beanie-pro-upgrade-plan.md` for setup instructions and phased rollout details.
