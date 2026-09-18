import UIKit
import MapKit

/**
 The full-screen map: every Roundtrip camera as a pin on Apple's satellite map,
 and a card at the bottom that dives into whichever one you tap.

 `hybridFlyover` is the reason this exists. It is Apple's 3D satellite mode —
 real terrain, real building shapes, place names on top — and over a city or a
 mountain it is a long way past what the globe can pull down as flat tiles. On
 a Mac, under Catalyst, the same code draws the same map.
 */
final class RoundtripMapViewController: UIViewController {

    var onPick: ((String) -> Void)?
    var onClose: (() -> Void)?

    private let pins: [CameraPin]
    private let focus: MapFocus
    private let mapView = MKMapView()

    private let card = UIView()
    private let cardTitle = UILabel()
    private let cardSubtitle = UILabel()
    private let watchButton = UIButton(type: .system)
    private var cardBottom: NSLayoutConstraint!
    private var selected: CameraPin?

    private let ink = UIColor(red: 0.91, green: 0.93, blue: 0.97, alpha: 1)
    private let dim = UIColor(red: 0.56, green: 0.64, blue: 0.74, alpha: 1)
    private let warm = UIColor(red: 1.0, green: 0.83, blue: 0.47, alpha: 1)
    private let deep = UIColor(red: 0.02, green: 0.03, blue: 0.05, alpha: 1)

    init(pins: [CameraPin], focus: MapFocus) {
        self.pins = pins
        self.focus = focus
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = deep

        layoutMap()
        layoutCloseButton()
        layoutCard()

        mapView.addAnnotations(pins.map(CameraAnnotation.init))
        openCamera()
    }

    // MARK: - map

    private func layoutMap() {
        mapView.delegate = self
        mapView.mapType = .hybridFlyover          // satellite, in 3D, with labels
        mapView.showsBuildings = true
        mapView.isPitchEnabled = true
        mapView.isRotateEnabled = true
        mapView.showsCompass = false
        mapView.pointOfInterestFilter = .excludingAll   // the cameras are the points of interest
        mapView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(mapView)
        NSLayoutConstraint.activate([
            mapView.topAnchor.constraint(equalTo: view.topAnchor),
            mapView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    /// Open pulled back, then settle onto the place the page was looking at, so
    /// the map arrives with a move rather than a cut.
    private func openCamera() {
        let centre = CLLocationCoordinate2D(latitude: focus.latitude, longitude: focus.longitude)
        let wide = MKMapCamera(lookingAtCenter: centre,
                               fromDistance: min(focus.altitude * 6, 18_000_000),
                               pitch: 0, heading: 0)
        mapView.setCamera(wide, animated: false)

        // Lean over only when close enough in for the 3D to be worth seeing;
        // a pitched view of a whole continent is just a squashed one.
        let close = MKMapCamera(lookingAtCenter: centre,
                                fromDistance: focus.altitude,
                                pitch: focus.altitude < 40_000 ? 55 : 0,
                                heading: 0)
        UIView.animate(withDuration: 1.4, delay: 0.05, options: [.curveEaseInOut]) {
            self.mapView.camera = close
        }
    }

    // MARK: - chrome

    private func layoutCloseButton() {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "xmark"), for: .normal)
        button.tintColor = ink
        button.backgroundColor = UIColor(white: 0.05, alpha: 0.52)
        button.layer.cornerRadius = 25
        button.layer.borderWidth = 1
        button.layer.borderColor = UIColor(white: 1, alpha: 0.32).cgColor
        button.addTarget(self, action: #selector(close), for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 14),
            button.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            button.widthAnchor.constraint(equalToConstant: 50),
            button.heightAnchor.constraint(equalToConstant: 50)
        ])
    }

    /// Tapping a pin raises this: which camera it is, and a way into it.
    private func layoutCard() {
        card.backgroundColor = UIColor(red: 0.04, green: 0.06, blue: 0.09, alpha: 0.92)
        card.layer.cornerRadius = 16
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(white: 1, alpha: 0.15).cgColor
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        cardTitle.textColor = ink
        cardTitle.font = .systemFont(ofSize: 19, weight: .semibold)
        cardTitle.numberOfLines = 2

        cardSubtitle.textColor = dim
        cardSubtitle.font = .systemFont(ofSize: 14)
        cardSubtitle.numberOfLines = 1

        watchButton.setTitle("Watch this one", for: .normal)
        watchButton.setTitleColor(deep, for: .normal)
        watchButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        watchButton.backgroundColor = warm
        watchButton.layer.cornerRadius = 11
        watchButton.addTarget(self, action: #selector(watch), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [cardTitle, cardSubtitle, watchButton])
        stack.axis = .vertical
        stack.spacing = 4
        stack.setCustomSpacing(14, after: cardSubtitle)
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)

        cardBottom = card.topAnchor.constraint(equalTo: view.bottomAnchor)

        NSLayoutConstraint.activate([
            cardBottom,
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            watchButton.heightAnchor.constraint(equalToConstant: 46)
        ])
    }

    private func showCard(for pin: CameraPin) {
        selected = pin
        cardTitle.text = pin.name
        cardSubtitle.text = pin.subtitle
        cardSubtitle.isHidden = pin.subtitle.isEmpty

        view.layoutIfNeeded()
        cardBottom.isActive = false
        cardBottom = card.bottomAnchor.constraint(
            equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20)
        cardBottom.isActive = true
        UIView.animate(withDuration: 0.28, delay: 0, usingSpringWithDamping: 0.88,
                       initialSpringVelocity: 0.4) { self.view.layoutIfNeeded() }
    }

    private func hideCard() {
        selected = nil
        cardBottom.isActive = false
        cardBottom = card.topAnchor.constraint(equalTo: view.bottomAnchor)
        cardBottom.isActive = true
        UIView.animate(withDuration: 0.2) { self.view.layoutIfNeeded() }
    }

    // MARK: - actions

    @objc private func close() {
        dismiss(animated: true) { self.onClose?() }
    }

    @objc private func watch() {
        guard let pin = selected else { return }
        onPick?(pin.id)
    }
}

// MARK: - annotations

final class CameraAnnotation: NSObject, MKAnnotation {
    let pin: CameraPin
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)
    }
    var title: String? { pin.name }
    var subtitle: String? { pin.subtitle.isEmpty ? nil : pin.subtitle }

    init(pin: CameraPin) { self.pin = pin }
}

extension RoundtripMapViewController: MKMapViewDelegate {

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let camera = annotation as? CameraAnnotation else { return nil }
        let id = "roundtrip-camera"
        let view = (mapView.dequeueReusableAnnotationView(withIdentifier: id) as? MKMarkerAnnotationView)
            ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: id)
        view.annotation = annotation
        view.glyphImage = UIImage(systemName: "video.fill")
        // Warm for a camera that is on air now, grey for one inside its off
        // hours — the same distinction the page makes in its rotation.
        view.markerTintColor = camera.pin.live ? warm : dim
        view.titleVisibility = .adaptive
        view.subtitleVisibility = .hidden
        view.displayPriority = camera.pin.live ? .required : .defaultHigh
        view.clusteringIdentifier = "roundtrip"     // thins the crowd when zoomed out
        return view
    }

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        // A cluster is not a camera: opening it means zooming into the group.
        if let cluster = view.annotation as? MKClusterAnnotation {
            let region = MKCoordinateRegion(center: cluster.coordinate,
                                            latitudinalMeters: 400_000,
                                            longitudinalMeters: 400_000)
            mapView.setRegion(mapView.regionThatFits(region), animated: true)
            mapView.deselectAnnotation(cluster, animated: false)
            return
        }
        guard let camera = view.annotation as? CameraAnnotation else { return }
        showCard(for: camera.pin)
    }

    func mapView(_ mapView: MKMapView, didDeselect view: MKAnnotationView) {
        if (view.annotation as? CameraAnnotation)?.pin.id == selected?.id { hideCard() }
    }
}
