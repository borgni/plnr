// Мост из интерфейса PLNR к виджету: сохраняет план на ближайшие дни и просит iPhone обновить виджет.
import Foundation
import Capacitor
import WidgetKit

@objc(PlnrWidgetPlugin)
public class PlnrWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlnrWidgetPlugin"
    public let jsName = "PlnrWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
    ]

    @objc func save(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? "{}"
        let ok = PlnrShared.write(json)
        if ok { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve(["ok": ok, "groups": PlnrShared.groupCandidates().joined(separator: ", ")])
    }
}

class PlnrViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PlnrWidgetPlugin())
    }
}
