import CodexRunwayCore
import Foundation

public enum RunwayCLIOutputFormat: Equatable {
    case text
    case json
}

public enum RunwayCLIArguments: Equatable {
    case status(format: RunwayCLIOutputFormat)
    case selfCheck
    case help

    public static func parse(_ arguments: [String]) throws -> RunwayCLIArguments {
        switch arguments {
        case []:
            return .status(format: .text)
        case ["status"]:
            return .status(format: .text)
        case ["--json"], ["status", "--json"]:
            return .status(format: .json)
        case ["--self-check"]:
            return .selfCheck
        case ["--help"], ["-h"], ["help"]:
            return .help
        default:
            throw RunwayCLIArgumentError.unknownCommand(arguments.joined(separator: " "))
        }
    }
}

public enum RunwayCLIArgumentError: Error, Equatable, CustomStringConvertible {
    case unknownCommand(String)

    public var description: String {
        switch self {
        case let .unknownCommand(command):
            return "unknown command: \(command)"
        }
    }
}

public struct RunwayCLIStatusSnapshot: Codable, Equatable {
    public var schemaVersion: Int
    public var generatedAt: String
    public var auth: RunwayCLIAuthSnapshot
    public var quota: RunwayCLIQuotaSnapshot?
    public var resetCredits: RunwayCLIResetCreditsSnapshot?
    public var sessions: RunwayCLISessionRepairSnapshot?
    public var recentSessions: [RunwayCLIRecentSessionSnapshot]
    public var apiEquivalent: RunwayCLIApiEquivalentSnapshot?
    public var errors: [RunwayCLIStatusError]

    public init(
        generatedAt: Date,
        auth: RunwayCLIAuthSnapshot,
        quota: RunwayCLIQuotaSnapshot?,
        resetCredits: RunwayCLIResetCreditsSnapshot?,
        sessions: RunwayCLISessionRepairSnapshot?,
        recentSessions: [RunwayCLIRecentSessionSnapshot],
        apiEquivalent: RunwayCLIApiEquivalentSnapshot?,
        errors: [RunwayCLIStatusError])
    {
        self.schemaVersion = 1
        self.generatedAt = RunwayCLIISO8601.string(generatedAt)
        self.auth = auth
        self.quota = quota
        self.resetCredits = resetCredits
        self.sessions = sessions
        self.recentSessions = recentSessions
        self.apiEquivalent = apiEquivalent
        self.errors = errors
    }

    public func encodedJSONData() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }
}

public struct RunwayCLIAuthSnapshot: Codable, Equatable {
    public var isAvailable: Bool
    public var tokenState: String
    public var accountId: String?
}

public struct RunwayCLIQuotaSnapshot: Codable, Equatable {
    public var plan: String?
    public var primary: RunwayCLIRateWindowSnapshot
    public var secondary: RunwayCLIRateWindowSnapshot?
    public var additional: [RunwayCLINamedRateWindowSnapshot]
    public var creditsBalance: Double?
    public var updatedAt: String
}

public struct RunwayCLIRateWindowSnapshot: Codable, Equatable {
    public var usedPercent: Int
    public var remainingPercent: Int
    public var resetsAt: String?
    public var secondsUntilReset: Int?
}

public struct RunwayCLINamedRateWindowSnapshot: Codable, Equatable {
    public var name: String
    public var window: RunwayCLIRateWindowSnapshot
}

public struct RunwayCLIResetCreditsSnapshot: Codable, Equatable {
    public var availableCount: Int
    public var totalCount: Int
    public var nextExpiresAt: String?
    public var secondsUntilNextExpiry: Int?
    public var credits: [RunwayCLIResetCreditSnapshot]
    public var updatedAt: String
}

public struct RunwayCLIResetCreditSnapshot: Codable, Equatable {
    public var id: String?
    public var status: String
    public var createdAt: String?
    public var expiresAt: String?
    public var remainingSeconds: Int
    public var risk: String
}

public struct RunwayCLISessionRepairSnapshot: Codable, Equatable {
    public var plannedEntries: Int
    public var missingCount: Int
    public var orphanCount: Int
    public var duplicateCount: Int
    public var staleTitleCount: Int
}

public struct RunwayCLIRecentSessionSnapshot: Codable, Equatable {
    public var id: String
    public var title: String
    public var projectName: String
    public var updatedAt: String
    public var state: String
    public var totalTokens: Int
    public var estimatedUSD: Decimal?
}

public struct RunwayCLIApiEquivalentSnapshot: Codable, Equatable {
    public var source: String
    public var confidence: String
    public var totalTokens: Int
    public var estimatedUSD: Decimal?
    public var pricingVersion: String
    public var calculatedAt: String
    public var windowStart: String
    public var windowEnd: String
}

public struct RunwayCLIStatusError: Codable, Equatable {
    public var area: String
    public var code: String
    public var message: String
    public var rawMessage: String?
    public var isRetryable: Bool

    public init(area: String, message: String) {
        let info = RunwayCLIErrorInfo.classify(message: message, error: nil)
        self.init(area: area, info: info)
    }

    public init(area: String, error: Error) {
        let info = RunwayCLIErrorInfo.classify(message: error.localizedDescription, error: error)
        self.init(area: area, info: info)
    }

    public init(area: String, code: String, message: String, rawMessage: String? = nil, isRetryable: Bool = false) {
        self.area = area
        self.code = code
        self.message = message
        self.rawMessage = rawMessage
        self.isRetryable = isRetryable
    }

    private init(area: String, info: RunwayCLIErrorInfo) {
        self.area = area
        self.code = info.code
        self.message = info.message
        self.rawMessage = info.rawMessage
        self.isRetryable = info.isRetryable
    }
}

private struct RunwayCLIErrorInfo {
    var code: String
    var message: String
    var rawMessage: String?
    var isRetryable: Bool

    static func classify(message: String, error: Error?) -> RunwayCLIErrorInfo {
        let raw = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if let urlError = error as? URLError {
            return classify(urlErrorCode: urlError.code, raw: raw)
        }

        if let error {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain, let urlErrorCode = URLError.Code(rawValue: nsError.code) {
                return classify(urlErrorCode: urlErrorCode, raw: raw)
            }
        }

        let lowercased = raw.lowercased()
        if lowercased.contains("nsurlerrordomain error -1001") ||
            lowercased.contains("timed out") ||
            lowercased.contains("timeout")
        {
            return info(code: "timeout", message: "请求超时，请稍后刷新", raw: raw, isRetryable: true)
        }
        if lowercased.contains("nsurlerrordomain error -1005") ||
            lowercased.contains("network connection was lost") ||
            lowercased.contains("connection reset") ||
            lowercased.contains("econnreset")
        {
            return info(code: "network_lost", message: "网络连接中断，请稍后刷新", raw: raw, isRetryable: true)
        }
        if lowercased.contains("nsurlerrordomain error -1009") ||
            lowercased.contains("not connected to the internet") ||
            lowercased.contains("enotfound") ||
            lowercased.contains("eai_again")
        {
            return info(code: "offline", message: "网络连接不可用，请检查后刷新", raw: raw, isRetryable: false)
        }
        if raw.contains("NSURLErrorDomain") {
            return info(code: "network_error", message: "网络请求失败，请稍后刷新", raw: raw, isRetryable: true)
        }
        return RunwayCLIErrorInfo(code: "unknown", message: raw.isEmpty ? "未知错误" : raw, rawMessage: nil, isRetryable: false)
    }

    private static func classify(urlErrorCode: URLError.Code, raw: String) -> RunwayCLIErrorInfo {
        switch urlErrorCode {
        case .timedOut:
            return info(code: "timeout", message: "请求超时，请稍后刷新", raw: raw, isRetryable: true)
        case .networkConnectionLost:
            return info(code: "network_lost", message: "网络连接中断，请稍后刷新", raw: raw, isRetryable: true)
        case .notConnectedToInternet:
            return info(code: "offline", message: "网络连接不可用，请检查后刷新", raw: raw, isRetryable: false)
        case .userAuthenticationRequired:
            return info(code: "auth_required", message: "需要重新登录 Codex", raw: raw, isRetryable: false)
        case .badServerResponse:
            return info(code: "bad_response", message: "服务返回异常，请稍后刷新", raw: raw, isRetryable: false)
        default:
            return info(code: "network_error", message: "网络请求失败，请稍后刷新", raw: raw, isRetryable: true)
        }
    }

    private static func info(code: String, message: String, raw: String, isRetryable: Bool) -> RunwayCLIErrorInfo {
        RunwayCLIErrorInfo(
            code: code,
            message: message,
            rawMessage: raw.isEmpty || raw == message ? nil : raw,
            isRetryable: isRetryable)
    }
}

public struct RunwayCLI {
    public var authStore: CodexAuthStore
    public var quotaClient: QuotaClient
    public var tokenRefresher: TokenRefresher
    public var sessionRepair: SessionRepairService
    public var sessionActivity: SessionActivityScanner
    public var costScanner: UsageCostScanner
    public var now: @Sendable () -> Date

    public init(
        authStore: CodexAuthStore = CodexAuthStore(),
        quotaClient: QuotaClient = QuotaClient(),
        tokenRefresher: TokenRefresher = TokenRefresher(),
        sessionRepair: SessionRepairService = SessionRepairService(),
        sessionActivity: SessionActivityScanner = SessionActivityScanner(),
        costScanner: UsageCostScanner = UsageCostScanner(),
        now: @escaping @Sendable () -> Date = { Date() })
    {
        self.authStore = authStore
        self.quotaClient = quotaClient
        self.tokenRefresher = tokenRefresher
        self.sessionRepair = sessionRepair
        self.sessionActivity = sessionActivity
        self.costScanner = costScanner
        self.now = now
    }

    public func run(
        arguments: [String],
        stdout: (String) -> Void = { print($0) },
        stderr: (String) -> Void = { FileHandle.standardError.write(Data(($0 + "\n").utf8)) })
        async -> Int32
    {
        do {
            switch try RunwayCLIArguments.parse(arguments) {
            case let .status(format):
                switch format {
                case .text:
                    await printStatus(stdout: stdout, stderr: stderr)
                case .json:
                    await printJSONStatus(stdout: stdout, stderr: stderr)
                }
                return 0
            case .selfCheck:
                printSelfCheck(stdout: stdout)
                return 0
            case .help:
                stdout(Self.helpText)
                return 0
            }
        } catch {
            stderr(String(describing: error))
            stderr(Self.helpText)
            return 2
        }
    }

    private func printStatus(stdout: (String) -> Void, stderr: (String) -> Void) async {
        stdout("Codex Runway CLI")
        do {
            var auth = try authStore.load()
            if TokenInspector.isExpired(auth.tokens.accessToken, now: now()) {
                try await tokenRefresher.refresh(&auth, store: authStore)
            }
            let quota = try await quotaClient.fetchQuota(auth: auth)
            stdout(formatQuota(quota))
            do {
                let resetCredits = try await quotaClient.fetchResetCredits(auth: auth)
                stdout(formatResetCredits(resetCredits))
            } catch {
                stdout("Reset credits: unavailable (\(error.localizedDescription))")
            }
        } catch {
            stderr("Remote quota unavailable: \(error.localizedDescription)")
        }
        printLocalSummaries(stdout: stdout)
    }

    private func printJSONStatus(stdout: (String) -> Void, stderr: (String) -> Void) async {
        do {
            let snapshot = await statusSnapshot()
            stdout(String(decoding: try snapshot.encodedJSONData(), as: UTF8.self))
        } catch {
            stderr("JSON status unavailable: \(error.localizedDescription)")
        }
    }

    public func statusSnapshot() async -> RunwayCLIStatusSnapshot {
        let generatedAt = now()
        var errors: [RunwayCLIStatusError] = []
        var authSnapshot = RunwayCLIAuthSnapshot(isAvailable: false, tokenState: "unavailable", accountId: nil)
        var quotaSnapshot: RunwayCLIQuotaSnapshot?
        var resetSnapshot: RunwayCLIResetCreditsSnapshot?

        do {
            var auth = try authStore.load()
            authSnapshot = RunwayCLIAuthSnapshot(
                isAvailable: true,
                tokenState: TokenInspector.isExpired(auth.tokens.accessToken, now: generatedAt) ? "expired" : "valid",
                accountId: auth.tokens.accountId)
            if TokenInspector.isExpired(auth.tokens.accessToken, now: generatedAt) {
                do {
                    try await tokenRefresher.refresh(&auth, store: authStore)
                    authSnapshot.tokenState = "refreshed"
                } catch {
                    errors.append(RunwayCLIStatusError(area: "auth.refresh", error: error))
                }
            }
            do {
                let quota = try await quotaClient.fetchQuota(auth: auth)
                quotaSnapshot = RunwayCLIQuotaSnapshot(quota: quota, now: generatedAt)
            } catch {
                errors.append(RunwayCLIStatusError(area: "quota", error: error))
            }
            do {
                let resetCredits = try await quotaClient.fetchResetCredits(auth: auth)
                resetSnapshot = RunwayCLIResetCreditsSnapshot(snapshot: resetCredits)
            } catch {
                errors.append(RunwayCLIStatusError(area: "resetCredits", error: error))
            }
        } catch {
            errors.append(RunwayCLIStatusError(area: "auth", error: error))
        }

        let sessionSnapshot: RunwayCLISessionRepairSnapshot?
        do {
            sessionSnapshot = RunwayCLISessionRepairSnapshot(report: try sessionRepair.dryRun())
        } catch {
            sessionSnapshot = nil
            errors.append(RunwayCLIStatusError(area: "sessions", error: error))
        }

        let recentSessions: [RunwayCLIRecentSessionSnapshot]
        do {
            recentSessions = try sessionActivity.scan(limit: 5).items.map(RunwayCLIRecentSessionSnapshot.init)
        } catch {
            recentSessions = []
            errors.append(RunwayCLIStatusError(area: "recentSessions", error: error))
        }

        let apiEquivalent: RunwayCLIApiEquivalentSnapshot?
        do {
            let window = DateInterval(start: generatedAt.addingTimeInterval(-7 * 86_400), end: generatedAt)
            apiEquivalent = RunwayCLIApiEquivalentSnapshot(summary: try costScanner.scanAPIEquivalent(window: window, calculatedAt: generatedAt))
        } catch {
            apiEquivalent = nil
            errors.append(RunwayCLIStatusError(area: "apiEquivalent", error: error))
        }

        return RunwayCLIStatusSnapshot(
            generatedAt: generatedAt,
            auth: authSnapshot,
            quota: quotaSnapshot,
            resetCredits: resetSnapshot,
            sessions: sessionSnapshot,
            recentSessions: recentSessions,
            apiEquivalent: apiEquivalent,
            errors: errors)
    }

    private func printSelfCheck(stdout: (String) -> Void) {
        do {
            let auth = try authStore.load()
            stdout(auth.redactedDescription)
            stdout(TokenInspector.isExpired(auth.tokens.accessToken, now: now()) ? "token: expired" : "token: valid")
        } catch {
            stdout("auth: unavailable (\(error.localizedDescription))")
        }
        stdout(sessionSummary())
    }

    private func printLocalSummaries(stdout: (String) -> Void) {
        stdout(sessionSummary())
        do {
            let recent = try sessionActivity.scan(limit: 5)
            if recent.items.isEmpty {
                stdout("recent sessions: none")
            } else {
                stdout("recent sessions:")
                for item in recent.items {
                    let amount = item.estimatedUSD.map(DurationFormatter.money) ?? "--"
                    stdout("- \(item.projectName): \(item.totals.totalTokens) tokens, \(amount), \(item.state.rawValue)")
                }
            }
        } catch {
            stdout("recent sessions: unavailable (\(error.localizedDescription))")
        }
        do {
            let window = DateInterval(start: now().addingTimeInterval(-7 * 86_400), end: now())
            let cost = try costScanner.scanAPIEquivalent(window: window, calculatedAt: now())
            let amount = cost.estimatedUSD.map(DurationFormatter.money) ?? "--"
            stdout("local API equivalent: \(amount), \(cost.totals.totalTokens) tokens, last 7 days")
        } catch {
            stdout("local API equivalent: unavailable (\(error.localizedDescription))")
        }
    }

    private func sessionSummary() -> String {
        do {
            let report = try sessionRepair.dryRun()
            return "sessions: \(report.plannedEntries), missing: \(report.missingIndexIDs.count), orphan: \(report.orphanIndexIDs.count)"
        } catch {
            return "sessions: unavailable (\(error.localizedDescription))"
        }
    }

    private func formatQuota(_ quota: QuotaSnapshot) -> String {
        let plan = quota.plan ?? "unknown"
        var parts = [
            "Quota: plan \(plan)",
            "5h \(quota.primary.usedPercent)% used\(resetSuffix(quota.primary))",
        ]
        if let weekly = quota.secondary {
            parts.append("weekly \(weekly.usedPercent)% used\(resetSuffix(weekly))")
        }
        for extra in quota.additionalWindows {
            parts.append("\(extra.name) \(extra.window.usedPercent)% used\(resetSuffix(extra.window))")
        }
        if let balance = quota.creditsBalance {
            parts.append(String(format: "credits %.2f", balance))
        }
        return parts.joined(separator: " | ")
    }

    private func formatResetCredits(_ snapshot: ResetCreditsSnapshot) -> String {
        let nextExpiry = snapshot.credits
            .filter { $0.status == "available" }
            .compactMap(\.expiresAt)
            .min()
            .map { ", next expires in \(DurationFormatter.localized($0.timeIntervalSince(snapshot.updatedAt), language: .english))" }
            ?? ""
        return "Reset credits: \(snapshot.availableCount) available / \(snapshot.credits.count) total\(nextExpiry)"
    }

    private func resetSuffix(_ window: RateWindow) -> String {
        guard let resetsAt = window.resetsAt else { return "" }
        return ", resets in \(DurationFormatter.localized(resetsAt.timeIntervalSince(now()), language: .english, includeSeconds: false))"
    }

    public static let helpText = """
    Usage: codex-runway-cli [status|--json|--self-check|--help]

    Commands:
      status        Show quota, reset credits, recent sessions, and local API-equivalent cost.
      --json        Show status as machine-readable JSON.
      --self-check  Print local auth/session diagnostics with tokens redacted.
      --help        Show this help.
    """
}

private extension RunwayCLIRateWindowSnapshot {
    init(window: RateWindow, now: Date) {
        let seconds = window.resetsAt.map { max(0, Int($0.timeIntervalSince(now).rounded(.up))) }
        self.init(
            usedPercent: window.usedPercent,
            remainingPercent: max(0, 100 - window.usedPercent),
            resetsAt: window.resetsAt.map(RunwayCLIISO8601.string),
            secondsUntilReset: seconds)
    }
}

private extension RunwayCLIQuotaSnapshot {
    init(quota: QuotaSnapshot, now: Date) {
        self.init(
            plan: quota.plan,
            primary: RunwayCLIRateWindowSnapshot(window: quota.primary, now: now),
            secondary: quota.secondary.map { RunwayCLIRateWindowSnapshot(window: $0, now: now) },
            additional: quota.additionalWindows.map {
                RunwayCLINamedRateWindowSnapshot(
                    name: $0.name,
                    window: RunwayCLIRateWindowSnapshot(window: $0.window, now: now))
            },
            creditsBalance: quota.creditsBalance,
            updatedAt: RunwayCLIISO8601.string(quota.updatedAt))
    }
}

extension RunwayCLIResetCreditsSnapshot {
    init(snapshot: ResetCreditsSnapshot) {
        let next = snapshot.credits
            .filter { $0.status == "available" }
            .compactMap(\.expiresAt)
            .min()
        self.init(
            availableCount: snapshot.availableCount,
            totalCount: snapshot.credits.count,
            nextExpiresAt: next.map(RunwayCLIISO8601.string),
            secondsUntilNextExpiry: next.map { max(0, Int($0.timeIntervalSince(snapshot.updatedAt).rounded(.up))) },
            credits: ResetCreditSummary.sortedByExpiry(snapshot.credits).map(RunwayCLIResetCreditSnapshot.init),
            updatedAt: RunwayCLIISO8601.string(snapshot.updatedAt))
    }
}

private extension RunwayCLIResetCreditSnapshot {
    init(credit: ResetCredit) {
        self.init(
            id: credit.id,
            status: credit.status,
            createdAt: credit.createdAt.map(RunwayCLIISO8601.string),
            expiresAt: credit.expiresAt.map(RunwayCLIISO8601.string),
            remainingSeconds: max(0, Int(credit.remainingSeconds.rounded(.up))),
            risk: ResetCreditRisk.classify(credit).jsonValue)
    }
}

private extension ResetCreditRisk {
    var jsonValue: String {
        switch self {
        case .available:
            return "available"
        case .expiring:
            return "expiring"
        case .unavailable:
            return "unavailable"
        }
    }
}

private extension RunwayCLISessionRepairSnapshot {
    init(report: SessionRepairReport) {
        self.init(
            plannedEntries: report.plannedEntries,
            missingCount: report.missingIndexIDs.count,
            orphanCount: report.orphanIndexIDs.count,
            duplicateCount: report.duplicateIndexIDs.count,
            staleTitleCount: report.staleTitleIDs.count)
    }
}

private extension RunwayCLIRecentSessionSnapshot {
    init(item: SessionActivityItem) {
        self.init(
            id: item.id,
            title: item.title,
            projectName: item.projectName,
            updatedAt: RunwayCLIISO8601.string(item.updatedAt),
            state: item.state.rawValue,
            totalTokens: item.totals.totalTokens,
            estimatedUSD: item.estimatedUSD)
    }
}

private extension RunwayCLIApiEquivalentSnapshot {
    init(summary: ApiEquivalentSummary) {
        self.init(
            source: summary.source.rawValue,
            confidence: summary.confidence.rawValue,
            totalTokens: summary.totals.totalTokens,
            estimatedUSD: summary.estimatedUSD,
            pricingVersion: summary.pricingVersion,
            calculatedAt: RunwayCLIISO8601.string(summary.calculatedAt),
            windowStart: RunwayCLIISO8601.string(summary.window.start),
            windowEnd: RunwayCLIISO8601.string(summary.window.end))
    }
}

private enum RunwayCLIISO8601 {
    static func string(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}
