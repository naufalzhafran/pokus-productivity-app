#!/bin/sh
# Execute the production account coordinator on macOS without an iOS simulator.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/pokus-model-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/Sources/ModelUnderTest" "$test_dir/Tests/ModelTests"
for module in DailyCore DailyPersistence PokusCore PokusPersistence PokusNetworking; do
    ln -s "$root/Sources/$module" "$test_dir/Sources/$module"
done
for source in PokusModel FeatureState ModelDependencies WorkspaceCommands UITestPocketBase HabitViewStore PagingState NotificationRoute; do
    ln -s "$root/Daily/Pokus/$source.swift" "$test_dir/Sources/ModelUnderTest/$source.swift"
done
ln -s "$root/Daily/Services/CaptureReminderScheduler.swift" "$test_dir/Sources/ModelUnderTest/CaptureReminderScheduler.swift"
ln -s "$root/Scripts/ModelTestSupport.swift" "$test_dir/Sources/ModelUnderTest/ModelTestSupport.swift"
ln -s "$root/DailyTests/PokusModelTests.swift" "$test_dir/Tests/ModelTests/PokusModelTests.swift"
cat > "$test_dir/Package.swift" <<'MANIFEST'
// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "PokusModelTests", platforms: [.macOS(.v14)], targets: [
    .target(name: "DailyCore"),
    .target(name: "DailyPersistence", dependencies: ["DailyCore"]),
    .target(name: "PokusCore", dependencies: ["DailyCore"], resources: [.process("Resources")]),
    .target(name: "PokusPersistence", dependencies: ["PokusCore"]),
    .target(name: "PokusNetworking", dependencies: ["PokusCore"]),
    .target(name: "ModelUnderTest", dependencies: ["DailyCore", "DailyPersistence", "PokusCore", "PokusPersistence", "PokusNetworking"],
        swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]),
    .testTarget(name: "ModelTests", dependencies: ["ModelUnderTest", "PokusCore", "PokusPersistence", "PokusNetworking"])
])
MANIFEST
swift test --package-path "$test_dir"
