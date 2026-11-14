#!/bin/bash
# Выполняется на облачном Mac: создаёт проект Xcode, ставит иконку, заставку и настройки
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && cp -R ../src www
[ -d ios ] || npx cap add ios
npx cap sync ios

APP=ios/App/App
# иконка
ICONSET="$APP/Assets.xcassets/AppIcon.appiconset"
for f in "$ICONSET"/*.png; do cp assets/AppIcon-1024.png "$f"; done
# заставка запуска
SPLASH="$APP/Assets.xcassets/Splash.imageset"
if [ -d "$SPLASH" ]; then for f in "$SPLASH"/*.png; do cp assets/splash-2732.png "$f"; done; fi

PL="$APP/Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$PL" 2>/dev/null || true; }
pb "Set :CFBundleDisplayName PLNR"
pb "Delete :UIStatusBarStyle";  pb "Add :UIStatusBarStyle string UIStatusBarStyleLightContent"
pb "Delete :UIViewControllerBasedStatusBarAppearance"; pb "Add :UIViewControllerBasedStatusBarAppearance bool false"
pb "Delete :UIUserInterfaceStyle"; pb "Add :UIUserInterfaceStyle string Dark"
pb "Delete :ITSAppUsesNonExemptEncryption"; pb "Add :ITSAppUsesNonExemptEncryption bool false"
# только вертикально на iPhone
pb "Delete :UISupportedInterfaceOrientations"
pb "Add :UISupportedInterfaceOrientations array"
pb "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait"
echo "iOS project ready"
