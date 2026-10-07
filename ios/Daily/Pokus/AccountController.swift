import AuthenticationServices
import Foundation
import PokusCore
import Security
import UIKit

struct CredentialStore: AccountCredentials {
    private static let service = "com.centaurwarrunner.Daily.pokus"
    func read() throws -> Authentication? {
        var query = Self.query
        query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw PokusError.message("Couldn't unlock your saved account. Try again after unlocking your iPhone.") }
        return try JSONDecoder().decode(Authentication.self, from: data)
    }
    func save(_ auth: Authentication) throws {
        let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(auth), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let updated = SecItemUpdate(Self.query as CFDictionary, attributes as CFDictionary)
        if updated == errSecItemNotFound {
            let status = SecItemAdd(Self.query.merging(attributes, uniquingKeysWith: { _, new in new }) as CFDictionary, nil)
            guard status == errSecSuccess else { throw PokusError.message("Couldn't save your account securely.") }
        } else if updated != errSecSuccess { throw PokusError.message("Couldn't save your account securely.") }
    }
    func clear() throws {
        let status = SecItemDelete(Self.query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw PokusError.message("Couldn't sign out. Unlock your iPhone and try again.") }
    }
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "account"]
    }
}

@MainActor
final class GoogleSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func authenticate(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "pokus") { [weak self] callback, error in
                Task { @MainActor in self?.session = nil }
                if let callback { continuation.resume(returning: callback) }
                else { continuation.resume(throwing: error ?? PokusError.message("Google sign-in was cancelled.")) }
            }
            self.session = session; session.presentationContextProvider = self
            if !session.start() { self.session = nil; continuation.resume(throwing: PokusError.message("Couldn't open Google sign-in.")) }
        }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
