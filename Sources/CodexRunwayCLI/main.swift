import CodexRunwayCLIKit

#if os(Windows)
import WinSDK
#elseif canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

let exitCode = await RunwayCLI().run(arguments: Array(CommandLine.arguments.dropFirst()))
#if os(Windows)
ExitProcess(UInt32(exitCode))
#else
exit(exitCode)
#endif
