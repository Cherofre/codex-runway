import Foundation

#if canImport(Darwin)
import Darwin

public final class SingleInstanceGuard: @unchecked Sendable, Equatable {
    private let fileDescriptor: Int32

    private init(fileDescriptor: Int32) {
        self.fileDescriptor = fileDescriptor
    }

    deinit {
        flock(fileDescriptor, LOCK_UN)
        close(fileDescriptor)
    }

    public static func == (lhs: SingleInstanceGuard, rhs: SingleInstanceGuard) -> Bool {
        lhs.fileDescriptor == rhs.fileDescriptor
    }

    public static func acquire(lockURL: URL = defaultLockURL()) throws -> SingleInstanceGuard? {
        try FileManager.default.createDirectory(
            at: lockURL.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        let fd = open(lockURL.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        if flock(fd, LOCK_EX | LOCK_NB) == 0 {
            return SingleInstanceGuard(fileDescriptor: fd)
        }
        let code = POSIXErrorCode(rawValue: errno) ?? .EIO
        close(fd)
        if code == .EWOULDBLOCK { return nil }
        throw POSIXError(code)
    }

    public static func defaultLockURL() -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Codex Runway", isDirectory: true)
            .appendingPathComponent("codex-runway.lock")
    }
}
#else
public final class SingleInstanceGuard: @unchecked Sendable, Equatable {
    private static let registry = SingleInstanceRegistry()

    private let lockPath: String

    private init(lockPath: String) {
        self.lockPath = lockPath
    }

    deinit {
        Self.registry.release(lockPath)
    }

    public static func == (lhs: SingleInstanceGuard, rhs: SingleInstanceGuard) -> Bool {
        lhs.lockPath == rhs.lockPath
    }

    public static func acquire(lockURL: URL = defaultLockURL()) throws -> SingleInstanceGuard? {
        try FileManager.default.createDirectory(
            at: lockURL.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        let path = lockURL.path
        guard registry.acquire(path) else { return nil }
        if !FileManager.default.fileExists(atPath: path) {
            _ = FileManager.default.createFile(atPath: path, contents: nil)
        }
        return SingleInstanceGuard(lockPath: path)
    }

    public static func defaultLockURL() -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex-runway", isDirectory: true)
            .appendingPathComponent("codex-runway.lock")
    }
}

private final class SingleInstanceRegistry: @unchecked Sendable {
    private let lock = NSLock()
    private var acquiredPaths: Set<String> = []

    func acquire(_ path: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !acquiredPaths.contains(path) else { return false }
        acquiredPaths.insert(path)
        return true
    }

    func release(_ path: String) {
        lock.lock()
        acquiredPaths.remove(path)
        lock.unlock()
    }
}
#endif
