// Rebuild Pokus's existing concentric-circle mark: swift Scripts/GenerateAppIcon.swift
import AppKit

let size = 1024
let drawing = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                        bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: drawing, flipped: false)
let green = NSColor(srgbRed: 40.0 / 255, green: 102.0 / 255, blue: 91.0 / 255, alpha: 1)
green.setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()
NSColor(srgbRed: 246.0 / 255, green: 245.0 / 255, blue: 240.0 / 255, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 128, y: 128, width: 768, height: 768)).fill()
green.setFill()
NSBezierPath(ovalIn: NSRect(x: 320, y: 320, width: 384, height: 384)).fill()
NSGraphicsContext.restoreGraphicsState()
let output = URL(fileURLWithPath: "Daily/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
let bitmap = NSBitmapImageRep(cgImage: drawing.makeImage()!)
try bitmap.representation(using: .png, properties: [:])!.write(to: output)
print("Generated \(output.lastPathComponent)")
