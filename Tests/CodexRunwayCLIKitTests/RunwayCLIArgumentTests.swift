import Testing
@testable import CodexRunwayCLIKit

@Test func parsesDefaultStatusCommand() throws {
    #expect(try RunwayCLIArguments.parse([]) == .status(format: .text))
}

@Test func parsesExplicitStatusCommand() throws {
    #expect(try RunwayCLIArguments.parse(["status"]) == .status(format: .text))
}

@Test func parsesJSONStatusCommand() throws {
    #expect(try RunwayCLIArguments.parse(["--json"]) == .status(format: .json))
    #expect(try RunwayCLIArguments.parse(["status", "--json"]) == .status(format: .json))
}

@Test func parsesSelfCheckCommand() throws {
    #expect(try RunwayCLIArguments.parse(["--self-check"]) == .selfCheck)
}

@Test func parsesHelpCommand() throws {
    #expect(try RunwayCLIArguments.parse(["--help"]) == .help)
    #expect(try RunwayCLIArguments.parse(["-h"]) == .help)
}

@Test func rejectsUnknownCommand() {
    do {
        _ = try RunwayCLIArguments.parse(["wat"])
        Issue.record("Expected unknown command to throw")
    } catch let error as RunwayCLIArgumentError {
        #expect(error == .unknownCommand("wat"))
    } catch {
        Issue.record("Expected RunwayCLIArgumentError, got \(error)")
    }
}
