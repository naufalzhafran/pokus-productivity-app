// Used only by test-model.sh. Tests inject credentials and timer surfaces.
import Foundation
import PokusCore

struct CredentialStore: AccountCredentials {
    func read() throws -> Authentication? { fatalError("Inject test credentials") }
    func save(_ auth: Authentication) throws { fatalError("Inject test credentials") }
    func clear() throws { fatalError("Inject test credentials") }
}
@MainActor final class TimerSurfaces: TimerSurfaceClient {
    func clear() async { fatalError("Inject test surfaces") }
    func update(_ session: FocusSession?) async { fatalError("Inject test surfaces") }
}
@MainActor final class GoogleSignIn {
    func authenticate(url: URL) async throws -> URL { throw URLError(.unsupportedURL) }
}
