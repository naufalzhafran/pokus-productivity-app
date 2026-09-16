// Rebuild the geometric app icon: swift Scripts/GenerateAppIcon.swift
import AppKit

let size = 1024
let drawing = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                        bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
let context = NSGraphicsContext(cgContext: drawing, flipped: false)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor(srgbRed: 0.96, green: 0.97, blue: 0.93, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()
let greens: [NSColor] = [
    NSColor(srgbRed: 0.78, green: 0.87, blue: 0.76, alpha: 1),
    NSColor(srgbRed: 0.50, green: 0.73, blue: 0.48, alpha: 1),
    NSColor(srgbRed: 0.16, green: 0.50, blue: 0.30, alpha: 1)
]
let levels = [[0, 1, 2], [1, 2, 2], [2, 2, 2]]
for row in 0..<3 {
    for col in 0..<3 {
        greens[levels[row][col]].setFill()
        let rect = NSRect(x: 191 + col * 224, y: 641 - row * 224, width: 194, height: 194)
        NSBezierPath(roundedRect: rect, xRadius: 40, yRadius: 40).fill()
    }
}
NSColor.white.setStroke()
let check = NSBezierPath()
check.move(to: NSPoint(x: 680, y: 282))
check.line(to: NSPoint(x: 711, y: 251))
check.line(to: NSPoint(x: 770, y: 315))
check.lineWidth = 16
check.lineCapStyle = .round
check.lineJoinStyle = .round
check.stroke()
NSGraphicsContext.restoreGraphicsState()
let output = URL(fileURLWithPath: "Daily/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
let bitmap = NSBitmapImageRep(cgImage: drawing.makeImage()!)
try bitmap.representation(using: .png, properties: [:])!.write(to: output)
print("Generated \(output.lastPathComponent)")
