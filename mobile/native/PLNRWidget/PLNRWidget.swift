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

// Строка дела: цветная точка на линии дня, название и время
struct TaskRow: View {
    let task: WTask
    let compact: Bool
    let isLast: Bool
    var gap: CGFloat = 6
    var body: some View {
        let dot: CGFloat = compact ? 8 : 9
        let top: CGFloat = compact ? 4 : 5
        HStack(alignment: .top, spacing: compact ? 8 : 10) {
            Circle().fill(Color(hex: task.c).opacity(task.d ? 0.45 : 1))
                .frame(width: dot, height: dot)
                .padding(.top, top)
                .widgetAccentable()
            VStack(alignment: .leading, spacing: 1) {
                Text(task.t).font(.system(size: compact ? 12.5 : 14, weight: .semibold)).lineLimit(1)
                    .foregroundColor(.white.opacity(task.d ? 0.45 : 1))
                if !compact {
                    Text(task.d ? "выполнено" : task.time).font(.system(size: 11.5, weight: .medium))
                        .foregroundColor(.white.opacity(0.55)).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        // линия дня — от точки до следующей точки
        .background(alignment: .topLeading) {
            if !isLast {
                Rectangle().fill(Color.white.opacity(0.18))
                    .frame(width: 1.5)
                    .padding(.top, top + dot + 2)
                    .padding(.bottom, -(gap + top) + 2)
                    .padding(.leading, (dot - 1.5) / 2)
            }
        }
    }
}

// Полоса прогресса внизу: «Выполнено 1 из 4»
struct ProgressFooter: View {
    let done: Int
    let total: Int
    let compact: Bool
    var body: some View {
        let p = total == 0 ? 0 : Double(done) / Double(total)
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(compact ? "\(done) из \(total)" : "Выполнено \(done) из \(total)")
                Spacer(minLength: 0)
                if !compact { Text("\(Int((p * 100).rounded()))%") }
            }
            .font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.6))
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.16))
                    Capsule().fill(Color(hex: "#5ee2a0")).frame(width: max(p > 0 ? 5 : 0, g.size.width * p)).widgetAccentable()
                }
            }.frame(height: 5)
        }
    }
}

struct PlanView: View {
    let entry: PlanEntry
    @Environment(\.widgetFamily) var family

    var compact: Bool { family == .systemSmall }
    var limit: Int { family == .systemLarge ? 7 : family == .systemMedium ? 3 : 3 }
    var ordered: [WTask] { entry.tasks.filter { !$0.d } + entry.tasks.filter { $0.d } }

    var header: some View {
        let f = DateFormatter(); f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = compact ? "EE, d MMM" : "EEEE, d MMMM"
        return Text(f.string(from: entry.date).uppercased())
            .font(.system(size: 11, weight: .bold)).kerning(0.6)
            .foregroundColor(.white.opacity(0.6)).lineLimit(1)
    }

    var body: some View {
        let done = entry.tasks.filter { $0.d }.count
        VStack(alignment: .leading, spacing: compact ? 6 : 8) {
            header
            if !entry.ready {
                Text("Откройте PLNR, чтобы показать план").font(.system(size: 12)).foregroundColor(.white.opacity(0.7))
                Spacer(minLength: 0)
            } else if entry.tasks.isEmpty {
                Text("Дел нет — свободный день").font(.system(size: 13, weight: .medium)).foregroundColor(.white.opacity(0.75))
                Spacer(minLength: 0)
            } else {
                let shown = Array(ordered.prefix(limit))
                let gap: CGFloat = compact ? 5 : (family == .systemLarge ? 10 : 6)
                VStack(alignment: .leading, spacing: gap) {
                    ForEach(Array(shown.enumerated()), id: \.offset) { i, t in
                        TaskRow(task: t, compact: compact, isLast: i == shown.count - 1, gap: gap)
                    }
                    if ordered.count > limit {
                        Text("ещё \(ordered.count - limit)").font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white.opacity(0.5)).padding(.leading, compact ? 16 : 19)
                    }
                }
                Spacer(minLength: 0)
                ProgressFooter(done: done, total: entry.tasks.count, compact: compact)
            }
        }
    }
}

struct LockView: View {
    let entry: PlanEntry
    var body: some View {
        let next = entry.tasks.first { !$0.d }
        let done = entry.tasks.filter { $0.d }.count
        VStack(alignment: .leading, spacing: 1) {
            Text(entry.tasks.isEmpty ? "PLNR" : "Выполнено \(done) из \(entry.tasks.count)").font(.system(size: 12, weight: .semibold)).widgetAccentable()
            Text(next?.t ?? (entry.tasks.isEmpty ? "Дел нет" : "Всё сделано")).font(.system(size: 14, weight: .semibold)).lineLimit(2)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Фон «как стекло»: полупрозрачный графит со светлой кромкой.
// В режиме «Прозрачные» на экране «Домой» iPhone сам заменит его настоящим стеклом.
struct GlassBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: "#46536b").opacity(0.92), Color(hex: "#2b3446").opacity(0.94)],
                           startPoint: .top, endPoint: .bottom)
            ContainerRelativeShape()
                .strokeBorder(LinearGradient(colors: [Color.white.opacity(0.35), Color.white.opacity(0.06), Color.white.opacity(0.14)],
                                             startPoint: .top, endPoint: .bottom), lineWidth: 1)
        }
    }
}

struct EntryView: View {
    let entry: PlanEntry
    @Environment(\.widgetFamily) var family
    var body: some View {
        if family == .accessoryRectangular {
            LockView(entry: entry).containerBackground(for: .widget) { Color.clear }
        } else {
            PlanView(entry: entry).containerBackground(for: .widget) { GlassBackground() }
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
