// swift-tools-version: 6.0

import PackageDescription

var products: [Product] = [
    .executable(name: "CodexRunwayCLI", targets: ["CodexRunwayCLI"]),
    .library(name: "CodexRunwayCore", targets: ["CodexRunwayCore"]),
]

var dependencies: [Package.Dependency] = []

var targets: [Target] = [
    .target(name: "CodexRunwayCore"),
    .target(
        name: "CodexRunwayCLIKit",
        dependencies: ["CodexRunwayCore"]),
    .executableTarget(
        name: "CodexRunwayCLI",
        dependencies: ["CodexRunwayCLIKit"]),
    .testTarget(
        name: "CodexRunwayCoreTests",
        dependencies: ["CodexRunwayCore"]),
    .testTarget(
        name: "CodexRunwayCLIKitTests",
        dependencies: ["CodexRunwayCLIKit"]),
]

#if os(macOS)
products.insert(.executable(name: "CodexRunway", targets: ["CodexRunway"]), at: 0)
dependencies.append(contentsOf: [
    .package(url: "https://github.com/Mijick/CalendarView.git", exact: "1.1.1"),
    .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.3"),
])
targets.insert(
    .executableTarget(
        name: "CodexRunway",
        dependencies: [
            "CodexRunwayCore",
            .product(name: "MijickCalendarView", package: "CalendarView"),
            .product(name: "Sparkle", package: "Sparkle"),
        ]),
    at: 1)
#endif

let package = Package(
    name: "CodexRunway",
    platforms: [
        .macOS(.v12),
    ],
    products: products,
    dependencies: dependencies,
    targets: targets)
