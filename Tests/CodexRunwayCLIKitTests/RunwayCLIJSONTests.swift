import Foundation
import Testing
import CodexRunwayCore
@testable import CodexRunwayCLIKit

@Test func encodesStatusSnapshotWithStableSchemaFields() throws {
    let snapshot = RunwayCLIStatusSnapshot(
        generatedAt: Date(timeIntervalSince1970: 0),
        auth: RunwayCLIAuthSnapshot(isAvailable: false, tokenState: "unavailable", accountId: nil),
        quota: nil,
        resetCredits: nil,
        sessions: nil,
        recentSessions: [],
        apiEquivalent: nil,
        errors: [RunwayCLIStatusError(area: "auth", message: "missing")])

    let data = try snapshot.encodedJSONData()
    let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

    #expect(object["schemaVersion"] as? Int == 1)
    #expect(object["generatedAt"] as? String == "1970-01-01T00:00:00Z")
    #expect((object["errors"] as? [[String: Any]])?.first?["area"] as? String == "auth")
}

@Test func statusErrorsExposeStructuredNetworkFailureFields() throws {
    let error = RunwayCLIStatusError(area: "quota", error: URLError(.timedOut))
    let snapshot = RunwayCLIStatusSnapshot(
        generatedAt: Date(timeIntervalSince1970: 0),
        auth: RunwayCLIAuthSnapshot(isAvailable: true, tokenState: "valid", accountId: "acct"),
        quota: nil,
        resetCredits: nil,
        sessions: nil,
        recentSessions: [],
        apiEquivalent: nil,
        errors: [error])

    let data = try snapshot.encodedJSONData()
    let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let errors = try #require(object["errors"] as? [[String: Any]])
    let encoded = try #require(errors.first)

    #expect(encoded["area"] as? String == "quota")
    #expect(encoded["code"] as? String == "timeout")
    #expect(encoded["message"] as? String == "请求超时，请稍后刷新")
    #expect(encoded["rawMessage"] as? String == URLError(.timedOut).localizedDescription)
    #expect(encoded["isRetryable"] as? Bool == true)
}

@Test func resetCreditsExposeSortedCreditDetails() throws {
    let snapshot = ResetCreditsSnapshot(
        availableCount: 2,
        credits: [
            ResetCredit(
                id: "later",
                status: "available",
                createdAt: Date(timeIntervalSince1970: 100),
                expiresAt: Date(timeIntervalSince1970: 1_900),
                remainingSeconds: 900),
            ResetCredit(
                id: "used",
                status: "used",
                createdAt: nil,
                expiresAt: Date(timeIntervalSince1970: 1_100),
                remainingSeconds: 100),
            ResetCredit(
                id: "soon",
                status: "available",
                createdAt: nil,
                expiresAt: Date(timeIntervalSince1970: 1_300),
                remainingSeconds: 300),
            ResetCredit(
                id: "none",
                status: "available",
                createdAt: nil,
                expiresAt: nil,
                remainingSeconds: 0),
        ],
        updatedAt: Date(timeIntervalSince1970: 1_000))

    let encoded = RunwayCLIResetCreditsSnapshot(snapshot: snapshot)

    #expect(encoded.nextExpiresAt == "1970-01-01T00:21:40Z")
    #expect(encoded.secondsUntilNextExpiry == 300)
    #expect(encoded.credits.map(\.id) == ["used", "soon", "later", "none"])
    #expect(encoded.credits[0].risk == "unavailable")
    #expect(encoded.credits[1].risk == "expiring")
}
