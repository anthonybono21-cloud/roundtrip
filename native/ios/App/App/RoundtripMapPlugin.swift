import Foundation
import CoreLocation
import Capacitor

/**
 The map behind Roundtrip's map button, on iPhone, iPad and Mac.

 The web app's globe is stitched from raster tiles inside a WebGL scene, which
 is as far as a browser can reasonably go. Every Apple device already carries
 MapKit, so in the app the same camera list is thrown onto a real map: satellite
 imagery with Apple's 3D Flyover terrain and buildings, every camera as a pin,
 and a tap that dives into one.

 MapKit in a native app needs no key and no account beyond the one it takes to
 build the app at all, which keeps the whole thing inside the project's rule
 about paid APIs.

 The map is presented over the web view rather than replacing it, so the page
 keeps its WebGL context and its loaded tiles and coming back is instant.
 */
@objc(RoundtripMapPlugin)
public class RoundtripMapPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "RoundtripMapPlugin"
    public let jsName = "RoundtripMap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isOpen", returnType: CAPPluginReturnPromise)
    ]

    private var mapController: RoundtripMapViewController?

    @objc func show(_ call: CAPPluginCall) {
        let pins = (call.getArray("pins") ?? []).compactMap { $0 as? [String: Any] }
        let focus = call.getObject("focus") ?? [:]

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard self.mapController == nil else { call.resolve(); return }
            guard let host = self.bridge?.viewController else {
                call.reject("No view controller to present the map from")
                return
            }

            let controller = RoundtripMapViewController(
                pins: pins.compactMap(CameraPin.init(json:)),
                focus: MapFocus(json: focus)
            )
            controller.modalPresentationStyle = .fullScreen
            controller.onPick = { [weak self] id in
                // The page owns the rotation and the dive; all this reports is
                // which camera was chosen.
                self?.notifyListeners("pinTapped", data: ["id": id])
            }
            controller.onClose = { [weak self] in
                self?.mapController = nil
                self?.notifyListeners("mapClosed", data: [:])
            }

            self.mapController = controller
            host.present(controller, animated: true) { call.resolve() }
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.mapController else { call.resolve(); return }
            self?.mapController = nil
            controller.dismiss(animated: true) { call.resolve() }
        }
    }

    @objc func isOpen(_ call: CAPPluginCall) {
        call.resolve(["open": mapController != nil])
    }
}

/// A number that crossed the bridge may arrive as an Int or as an NSNumber
/// depending on how JavaScript wrote it, and `as? Double` does not catch every
/// case. This does.
private func number(_ value: Any?) -> Double? {
    if let d = value as? Double { return d }
    if let i = value as? Int { return Double(i) }
    if let n = value as? NSNumber { return n.doubleValue }
    return nil
}

/// One camera, as the page hands it over: where it is and what to call it.
struct CameraPin {
    let id: String
    let name: String
    let subtitle: String
    let latitude: Double
    let longitude: Double
    let live: Bool

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String,
              let lat = number(json["lat"]),
              let lng = number(json["lng"]) else { return nil }
        self.id = id
        self.name = json["name"] as? String ?? ""
        self.subtitle = json["subtitle"] as? String ?? ""
        self.latitude = lat
        self.longitude = lng
        self.live = json["live"] as? Bool ?? true
    }
}

/// Where the map opens: over the camera on screen, or the whole world.
struct MapFocus {
    let latitude: Double
    let longitude: Double
    let zoom: Double

    init(json: [String: Any]) {
        latitude = number(json["lat"]) ?? 20
        longitude = number(json["lng"]) ?? 0
        zoom = number(json["zoom"]) ?? 2
    }

    /// Web map zoom levels to something MKMapView understands. Level 2 is most
    /// of a hemisphere, level 14 is a few streets.
    var altitude: CLLocationDistance {
        let metres = 40_075_000.0 / pow(2, max(0, zoom))
        return max(600, min(metres * 1.6, 14_000_000))
    }
}
