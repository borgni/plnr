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
        let file = PlnrShared.write(json)
        let kc = PlnrShared.writeKeychain(json)
        let ok = file || !kc.isEmpty
        if ok { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve(["ok": ok, "file": file, "keychain": kc.joined(separator: ", "),
                      "team": PlnrShared.teamID() ?? "—", "bundle": PlnrShared.appBundleID()])
    }
}

class PlnrViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PlnrWidgetPlugin())
    }
}
