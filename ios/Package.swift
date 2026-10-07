// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DailyKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "DailyCore", targets: ["DailyCore"]),
        .library(name: "DailyPersistence", targets: ["DailyPersistence"])
    ],
    targets: [
        .target(name: "DailyCore"),
        .target(name: "DailyPersistence", dependencies: ["DailyCore"]),
        .testTarget(name: "DailyCoreTests", dependencies: ["DailyCore"]),
        .testTarget(name: "DailyPersistenceTests", dependencies: ["DailyPersistence", "DailyCore"])
    ]
)

