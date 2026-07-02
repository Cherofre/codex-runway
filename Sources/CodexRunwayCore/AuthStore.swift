import Foundation

public struct CodexAuthStore: Sendable {
    public var authURL: URL

    public init(authURL: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex/auth.json")) {
        self.authURL = authURL
    }

    public func load() throws -> CodexAuth {
        let data = try Data(contentsOf: authURL)
        return try JSONDecoder().decode(CodexAuth.self, from: data)
    }

    public func save(_ auth: CodexAuth) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(auth)
        let temporary = authURL.deletingLastPathComponent().appendingPathComponent(".auth.json.tmp-\(UUID().uuidString)")
        #if os(macOS) || os(iOS) || os(tvOS) || os(watchOS)
        try data.write(to: temporary, options: .completeFileProtectionUnlessOpen)
        #else
        try data.write(to: temporary, options: .atomic)
        #endif
        #if os(macOS) || os(iOS) || os(tvOS) || os(watchOS)
        _ = try FileManager.default.replaceItemAt(authURL, withItemAt: temporary)
        #else
        try FileManager.default.replaceExistingItem(at: authURL, with: temporary)
        #endif
    }
}

private extension FileManager {
    func replaceExistingItem(at destination: URL, with temporary: URL) throws {
        if fileExists(atPath: destination.path) {
            try removeItem(at: destination)
        }
        try moveItem(at: temporary, to: destination)
    }
}
