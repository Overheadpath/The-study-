/**
 * Wrapper around device biometric auth.
 *
 * Real mobile integration examples:
 * - React Native: expo-local-authentication or react-native-biometrics
 * - iOS native: LocalAuthentication (Face ID / Touch ID)
 * - Android native: androidx.biometric.BiometricPrompt
 *
 * IMPORTANT: Biometric templates never leave the OS secure enclave/keystore.
 * This method only returns success/failure.
 */
export class BiometricService {
  constructor({ authenticator } = {}) {
    // inject authenticator for testing or platform adapter
    this.authenticator = authenticator ?? (async () => true);
  }

  async authenticateParent({ parentId, reason }) {
    const success = await this.authenticator({ parentId, reason });
    return Boolean(success);
  }
}
