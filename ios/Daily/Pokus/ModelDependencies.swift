import PokusCore
import Foundation
import PokusNetworking

protocol AccountCredentials {
    func read() throws -> Authentication?
    func save(_ auth: Authentication) throws
    func clear() throws
}

@MainActor
protocol TimerSurfaceClient {
    func clear() async
    func update(_ session: FocusSession?) async
}

/// A deadline must release the caller even if an injected transport ignores cancellation.
@MainActor
final class PreviewOperation {
    private var continuation: CheckedContinuation<LinkPreview?, Never>?
    private var requestTask: Task<Void, Never>?
    private var deadlineTask: Task<Void, Never>?
    func value(client: PocketBaseClient, url: URL, budget: Duration) async -> LinkPreview? {
        guard !Task.isCancelled else { return nil }
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                guard !Task.isCancelled else { continuation.resume(returning: nil); return }
                self.continuation = continuation
                requestTask = Task { [weak self] in
                    let result = try? await client.preview(url: url)
                    self?.finish(result)
                }
                deadlineTask = Task { [weak self] in
                    do { try await Task.sleep(for: budget) } catch { return }
                    self?.finish(nil)
                }
            }
        } onCancel: {
            Task { @MainActor in self.cancel() }
        }
    }
    func cancel() { finish(nil) }
    private func finish(_ result: LinkPreview?) {
        guard let continuation else { return }
        self.continuation = nil
        requestTask?.cancel(); deadlineTask?.cancel()
        requestTask = nil; deadlineTask = nil
        continuation.resume(returning: result)
    }
}
