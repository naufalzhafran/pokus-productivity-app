#!/bin/sh
# Run Foundation-only Pokus tests when Xcode's SwiftData macros are unavailable.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/pokus-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/Sources" "$test_dir/Tests"
for module in DailyCore PokusCore PokusPersistence PokusNetworking; do
    ln -s "$root/Sources/$module" "$test_dir/Sources/$module"
done
ln -s "$root/Tests/PokusTests" "$test_dir/Tests/PokusTests"
cat > "$test_dir/Package.swift" <<'MANIFEST'
// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "PokusPortableTests", platforms: [.macOS(.v14)], targets: [
    .target(name: "DailyCore"),
    .target(name: "PokusCore", dependencies: ["DailyCore"], resources: [.process("Resources")]),
    .target(name: "PokusPersistence", dependencies: ["PokusCore"]),
    .target(name: "PokusNetworking", dependencies: ["PokusCore"]),
    .testTarget(name: "PokusTests", dependencies: ["PokusCore", "PokusPersistence", "PokusNetworking"])
])
MANIFEST
developer_dir=$(xcode-select -p)
swift test --package-path "$test_dir" --build-system native --disable-xctest \
    -Xswiftc -F -Xswiftc "$developer_dir/Library/Developer/Frameworks" \
    -Xlinker -rpath -Xlinker "$developer_dir/Library/Developer/Frameworks" \
    -Xswiftc -load-plugin-library \
    -Xswiftc "$(xcrun --find swiftc | sed 's|/bin/swiftc$|/lib/swift/host/plugins/testing/libTestingMacros.dylib|')"
