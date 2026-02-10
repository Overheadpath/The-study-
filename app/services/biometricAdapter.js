/**
 * Generic biometric gateway.
 *
 * In React Native you can wire this to:
 * - Expo: LocalAuthentication.authenticateAsync()
 * - Native: LAContext (iOS) / BiometricPrompt (Android)
 *
 * IMPORTANT: No biometric data is stored by app logic.
 */
async function authenticateParentWithOS({ promptMessage, nativeBiometricAuth }) {
  if (typeof nativeBiometricAuth !== 'function') {
    throw new Error('Native biometric function is required');
  }

  const result = await nativeBiometricAuth({ promptMessage });
  return Boolean(result && result.success === true);
}

module.exports = { authenticateParentWithOS };
