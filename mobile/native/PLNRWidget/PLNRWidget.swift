// Виджет PLNR: план на сегодня на экране «Домой» и на экране блокировки.
import WidgetKit
import SwiftUI

struct WTask: Decodable, Hashable { let t: String; let time: String; let c: String; let d: Bool }
struct WTheme: Decodable { let bg0: String; let bg1: String; let acc: String; let soft: String }
struct WPayload: Decodable { let theme: WTheme; let days: [String: [WTask]] }

struct PlanEntry: TimelineEntry {
    let date: Date
    let tasks: [WTask]
    let theme: WTheme?
    let ready: Bool
}

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}

func dayKey(_ d: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: d)
}

struct Provider: TimelineProvider {
    func load() -> WPayload? {
        guard let data = PlnrShared.read() else { return nil }
        return try? JSONDecoder().decode(WPayload.self, from: data)
    }
    func entry(for date: Date, _ p: WPayload?) -> PlanEntry {
        PlanEntry(date: date, tasks: p?.days[dayKey(date)] ?? [], theme: p?.theme, ready: p != nil)
    }
    func placeholder(in context: Context) -> PlanEntry {
        PlanEntry(date: Date(), tasks: [WTask(t: "Пара: Трудовое право", time: "09:30", c: "#5cc8ff", d: false),
                                        WTask(t: "Смена на работе", time: "14:00", c: "#a78bfa", d: false)], theme: nil, ready: true)
    }
    func getSnapshot(in context: Context, completion: @escaping (PlanEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry(for: Date(), load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PlanEntry>) -> Void) {
        let p = load()
        let cal = Calendar.current
        var entries = [entry(for: Date(), p)]
        // в полночь виджет сам перелистывается на следующий день
        var day = cal.startOfDay(for: Date())
        for _ in 0..<3 {
            day = cal.date(byAdding: .day, value: 1, to: day)!
            entries.append(entry(for: day, p))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct TaskRow: View {
    let task: WTask
    let compact: Bool
    var body: some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: task.c)).frame(width: 4, height: compact ? 15 : 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(task.t).font(.system(size: compact ? 12.5 : 14, weight: .semibold)).lineLimit(1)
                    .strikethrough(false).foregroundColor(.white.opacity(task.d ? 0.45 : 1))
                if !compact {
                    Text(task.time).font(.system(size: 11.5, weight: .medium)).foregroundColor(.white.opacity(0.6)).lineLimit(1)
                }
            }
            Spacer(minLength: 2)
            if task.d {
                Image(systemName: "checkmark.circle.fill").font(.system(size: compact ? 12 : 15)).foregroundColor(Color(hex: "#34d399"))
            } else if compact && !task.time.isEmpty && task.time != "Весь день" {
                Text(task.time.components(separatedBy: " ").first ?? "").font(.system(size: 11, weight: .medium)).foregroundColor(.white.opacity(0.6))
            }
        }
    }
}

struct PlanView: View {
    let entry: PlanEntry
    @Environment(\.widgetFamily) var family

    var limit: Int { family == .systemLarge ? 9 : family == .systemMedium ? 4 : 3 }
    var ordered: [WTask] { entry.tasks.filter { !$0.d } + entry.tasks.filter { $0.d } }

    var header: some View {
        let f = DateFormatter(); f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "EEEE"
        let wd = f.string(from: entry.date).capitalized
        let left = entry.tasks.filter { !$0.d }.count
        return HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("\(Calendar.current.component(.day, from: entry.date))").font(.system(size: family == .systemSmall ? 30 : 34, weight: .light))
            VStack(alignment: .leading, spacing: 0) {
                Text(wd).font(.system(size: 13, weight: .bold)).lineLimit(1)
                Text(entry.tasks.isEmpty ? "свободно" : left == 0 ? "всё сделано" : "осталось \(left)")
                    .font(.system(size: 11, weight: .medium)).foregroundColor(.white.opacity(0.65))
            }
            Spacer(minLength: 0)
        }.foregroundColor(.white)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 5 : 7) {
            header
            if !entry.ready {
                Text("Откройте PLNR, чтобы показать план").font(.system(size: 12)).foregroundColor(.white.opacity(0.7))
            } else if entry.tasks.isEmpty {
                Text("На сегодня дел нет").font(.system(size: 13, weight: .medium)).foregroundColor(.white.opacity(0.7))
            } else {
                ForEach(ordered.prefix(limit), id: \.self) { TaskRow(task: $0, compact: family == .systemSmall) }
                if ordered.count > limit {
                    Text("ещё \(ordered.count - limit)").font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.55))
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct LockView: View {
    let entry: PlanEntry
    var body: some View {
        let next = entry.tasks.first { !$0.d }
        VStack(alignment: .leading, spacing: 1) {
            Text(next == nil ? "PLNR" : (next!.time)).font(.system(size: 12, weight: .semibold)).widgetAccentable()
            Text(next?.t ?? (entry.tasks.isEmpty ? "Дел нет" : "Всё сделано")).font(.system(size: 14, weight: .semibold)).lineLimit(2)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EntryView: View {
    let entry: PlanEntry
    @Environment(\.widgetFamily) var family
    var bg: LinearGradient {
        LinearGradient(colors: [Color(hex: entry.theme?.bg1 ?? "#0b2266"), Color(hex: entry.theme?.bg0 ?? "#061235")],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    var body: some View {
        if family == .accessoryRectangular {
            LockView(entry: entry).containerBackground(for: .widget) { Color.clear }
        } else {
            PlanView(entry: entry).containerBackground(for: .widget) { bg }
        }
    }
}

@main
struct PLNRWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PLNRDay", provider: Provider()) { EntryView(entry: $0) }
            .configurationDisplayName("PLNR — план на день")
            .description("Дела на сегодня")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}
