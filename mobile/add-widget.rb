# Добавляет в проект Xcode виджет PLNR и мост к нему (выполняется на облачном Mac).
require 'xcodeproj'
require 'fileutils'

root = File.expand_path(__dir__)
proj_path = File.join(root, 'ios/App/App.xcodeproj')
app_dir = File.join(root, 'ios/App')
project = Xcodeproj::Project.open(proj_path)
app = project.targets.find { |t| t.name == 'App' }
abort 'нет таргета App' unless app
exit 0 if project.targets.any? { |t| t.name == 'PLNRWidget' }

# файлы
FileUtils.cp(File.join(root, 'native/PlnrShared.swift'), File.join(app_dir, 'App/'))
FileUtils.cp(File.join(root, 'native/PlnrWidgetBridge.swift'), File.join(app_dir, 'App/'))
FileUtils.cp(File.join(root, 'native/App.entitlements'), File.join(app_dir, 'App/'))
FileUtils.mkdir_p(File.join(app_dir, 'PLNRWidget'))
Dir[File.join(root, 'native/PLNRWidget/*')].each { |f| FileUtils.cp(f, File.join(app_dir, 'PLNRWidget/')) }

app_group = project.main_group.find_subpath('App', false) || project.main_group
shared_ref = app_group.new_reference('PlnrShared.swift')
bridge_ref = app_group.new_reference('PlnrWidgetBridge.swift')
app.add_file_references([shared_ref, bridge_ref])

# таргет виджета
w = project.new_target(:app_extension, 'PLNRWidget', :ios, '17.0')
wgroup = project.main_group.new_group('PLNRWidget', 'PLNRWidget')
wsrc = wgroup.new_reference('PLNRWidget.swift')
wgroup.new_reference('Info.plist')
wgroup.new_reference('PLNRWidget.entitlements')
w.add_file_references([wsrc, shared_ref])

app_bundle = app.build_configurations.first.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] || 'com.borgni.plnr'
w.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = app_bundle + '.widget'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'PLNRWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = 'PLNRWidget/PLNRWidget.entitlements'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['SKIP_INSTALL'] = 'YES'
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
end
app.build_configurations.each { |c| c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements' }

# вложить виджет в приложение
app.add_dependency(w)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(w.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save

# плагин виджета — в список, который Capacitor загружает при старте
require 'json'
cfg = File.join(app_dir, 'App/capacitor.config.json')
if File.exist?(cfg)
  j = JSON.parse(File.read(cfg))
  j['packageClassList'] = ((j['packageClassList'] || []) + ['PlnrWidgetPlugin']).uniq
  File.write(cfg, JSON.pretty_generate(j))
  puts 'plugin list: ' + j['packageClassList'].join(', ')
end

# своё окно приложения, которое подключает мост к виджету
sb = File.join(app_dir, 'App/Base.lproj/Main.storyboard')
txt = File.read(sb)
txt = txt.sub(/customClass="CAPBridgeViewController" customModule="Capacitor"/, 'customClass="PlnrViewController" customModule="App" customModuleProvider="target"')
File.write(sb, txt)
sd = File.join(app_dir, 'App/SceneDelegate.swift')
if File.exist?(sd)
  t2 = File.read(sd).sub('rootViewController = CAPBridgeViewController()', 'rootViewController = PlnrViewController()')
  File.write(sd, t2)
  puts 'scene delegate: ' + (t2.include?('PlnrViewController') ? 'ok' : 'NOT PATCHED')
end
puts 'widget added; storyboard: ' + (txt.include?('PlnrViewController') ? 'ok' : 'NOT PATCHED')
