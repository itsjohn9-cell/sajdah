import AppKit

let output = CommandLine.arguments.dropFirst().first ?? "store"
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> NSColor {
    NSColor(srgbRed: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
}

func mark(in rect: NSRect) {
    NSGraphicsContext.saveGraphicsState()
    let transform = NSAffineTransform()
    transform.translateX(by: rect.minX, yBy: rect.minY)
    transform.scale(by: rect.width / 108)
    transform.concat()
    color(248, 247, 242).setFill()
    let arch = NSBezierPath()
    arch.move(to: NSPoint(x: 26, y: 25))
    arch.line(to: NSPoint(x: 26, y: 59))
    arch.curve(to: NSPoint(x: 54, y: 88), controlPoint1: NSPoint(x: 26, y: 74), controlPoint2: NSPoint(x: 42, y: 82))
    arch.curve(to: NSPoint(x: 82, y: 59), controlPoint1: NSPoint(x: 66, y: 82), controlPoint2: NSPoint(x: 82, y: 74))
    arch.line(to: NSPoint(x: 82, y: 25))
    arch.line(to: NSPoint(x: 72, y: 25))
    arch.line(to: NSPoint(x: 72, y: 58))
    arch.curve(to: NSPoint(x: 54, y: 77), controlPoint1: NSPoint(x: 72, y: 68), controlPoint2: NSPoint(x: 62, y: 73))
    arch.curve(to: NSPoint(x: 36, y: 58), controlPoint1: NSPoint(x: 46, y: 73), controlPoint2: NSPoint(x: 36, y: 68))
    arch.line(to: NSPoint(x: 36, y: 25))
    arch.close()
    arch.fill()
    color(213, 139, 86).setFill()
    NSRect(x: 44, y: 28, width: 20, height: 7).fill()
    NSGraphicsContext.restoreGraphicsState()
}

func render(_ name: String, width: Int, height: Int, draw: () -> Void) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    color(23, 107, 88).setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    draw()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("PNG encoding failed")
    }
    try data.write(to: URL(fileURLWithPath: "\(output)/\(name).png"))
}

try render("icon", width: 512, height: 512) {
    mark(in: NSRect(x: 0, y: 0, width: 512, height: 512))
}
try render("feature", width: 1024, height: 500) {
    mark(in: NSRect(x: 40, y: 90, width: 320, height: 320))
    let white = color(248, 247, 242)
    ("Sijda" as NSString).draw(at: NSPoint(x: 400, y: 285), withAttributes: [
        .font: NSFont.systemFont(ofSize: 84, weight: .semibold), .foregroundColor: white,
    ])
    ("Rakat · Tasbeeh · Qaza" as NSString).draw(at: NSPoint(x: 405, y: 225), withAttributes: [
        .font: NSFont.systemFont(ofSize: 30), .foregroundColor: white,
    ])
    ("Experimental camera-assisted counting" as NSString).draw(at: NSPoint(x: 405, y: 165), withAttributes: [
        .font: NSFont.systemFont(ofSize: 23), .foregroundColor: white,
    ])
}
