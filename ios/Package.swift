// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DailyKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "DailyCore", targets: ["DailyCore"]),
        .library(name: "DailyPersistence", targets: ["DailyPersistence"]),
        .library(name: "PokusCore", targets: ["PokusCore"]),
        .library(name: "PokusPersistence", targets: ["PokusPersistence"]),
        .library(name: "PokusNetworking", targets: ["PokusNetworking"])
    ],
    targets: [
        .target(name: "DailyCore"),
        .target(name: "PokusCore", dependencies: ["DailyCore"], resources: [.process("Resources")]),
        .target(name: "PokusPersistence", dependencies: ["PokusCore"]),
        .target(name: "PokusNetworking", dependencies: ["PokusCore"]),
        .executableTarget(name: "PokusIntegration", dependencies: ["PokusCore", "PokusNetworking"], path: "Scripts/PocketBaseIntegration"),
        .testTarget(name: "PokusTests", dependencies: ["PokusCore", "PokusPersistence", "PokusNetworking"]),
        .target(name: "DailyPersistence", dependencies: ["DailyCore"], swiftSettings: [
            .enableUpcomingFeature("InferSendableFromCaptures"),
            .enableExperimentalFeature("StrictConcurrency")
        ]),
        .testTarget(name: "DailyCoreTests", dependencies: ["DailyCore"]),
        .testTarget(name: "DailyPersistenceTests", dependencies: ["DailyPersistence", "DailyCore"])
    ]
)
