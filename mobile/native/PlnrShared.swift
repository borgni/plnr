// Общая часть приложения и виджета: где лежит файл с планом и как его прочитать.
import Foundation
import Security

enum PlnrShared {
    static let fileName = "plnr-widget.json"

    // Команда разработчика (у Sideloadly она своя для каждого Apple ID) — из префикса группы связки ключей
    static func teamID() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "plnr.team.probe",
            kSecAttrService as String: "plnr",
            kSecReturnAttributes as String: true,
        ]
        var result: AnyObject?
        var status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            var add = query
            add.removeValue(forKey: kSecReturnAttributes as String)
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
            status = SecItemCopyMatching(query as CFDictionary, &result)
        }
        guard status == errSecSuccess, let attrs = result as? [String: Any],
              let group = attrs[kSecAttrAccessGroup as String] as? String,
              let dot = group.firstIndex(of: ".") else { return nil }
        return String(group[..<dot])
    }

    // Приложение: com.borgni.plnr; виджет: com.borgni.plnr.widget — берём основу
    static func appBundleID() -> String {
        var id = Bundle.main.bundleIdentifier ?? "com.borgni.plnr"
        if id.hasSuffix(".widget") { id = String(id.dropLast(".widget".count)) }
        return id
    }

    // Возможные имена общей группы: исходное и варианты, которые делают программы переподписи
    static func groupCandidates() -> [String] {
        let base = appBundleID()
        var list = ["group.com.borgni.plnr", "group." + base]
        if let team = teamID() {
            list += ["group.com.borgni.plnr." + team, "group." + base + "." + team, "group." + team + ".com.borgni.plnr"]
        }
        var seen = Set<String>()
        return list.filter { seen.insert($0).inserted }
    }

    static func containerURL() -> URL? {
        for g in groupCandidates() {
            if let u = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: g) { return u }
        }
        return nil
    }

    static func write(_ json: String) -> Bool {
        guard let dir = containerURL() else { return false }
        do {
            try json.data(using: .utf8)!.write(to: dir.appendingPathComponent(fileName), options: .atomic)
            return true
        } catch { return false }
    }

    // Запасной путь без общей папки: связка ключей с общим префиксом команды
    // (бесплатный профиль Apple обычно разрешает любые группы вида TEAMID.*)
    static func keychainGroups() -> [String] {
        guard let team = teamID() else { return [] }
        return [team + ".com.borgni.plnr.shared", team + "." + appBundleID()]
    }

    static func writeKeychain(_ json: String) -> [String] {
        let data = json.data(using: .utf8)!
        var ok: [String] = []
        for g in keychainGroups() {
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: "plnr.widget",
                                    kSecAttrAccount as String: "plan",
                                    kSecAttrAccessGroup as String: g]
            SecItemDelete(q as CFDictionary)
            var add = q
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            if SecItemAdd(add as CFDictionary, nil) == errSecSuccess { ok.append(g) }
        }
        return ok
    }

    static func readKeychain() -> Data? {
        for g in keychainGroups() {
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: "plnr.widget",
                                    kSecAttrAccount as String: "plan",
                                    kSecAttrAccessGroup as String: g,
                                    kSecReturnData as String: true]
            var out: AnyObject?
            if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data { return d }
        }
        return nil
    }

    static func read() -> Data? {
        if let dir = containerURL(), let d = try? Data(contentsOf: dir.appendingPathComponent(fileName)) { return d }
        return readKeychain()
    }
}
