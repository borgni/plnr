# PLNR

День, календарь и дела — программа для Windows и приложение для iPhone с синхронизацией.

- `src/` — общий интерфейс (компьютер и телефон)
- `main.js`, `preload.js` — программа для Windows (Electron)
- `mobile/` — обёртка для iPhone (Capacitor)
- `.github/workflows/ios.yml` — сборка `PLNR.ipa` на облачном Mac; готовый файл появляется в **Releases**

## iPhone
Скачайте `PLNR.ipa` из последнего релиза и установите через Sideloadly со своим Apple ID.
С бесплатным Apple ID приложение нужно переподписывать раз в 7 дней (тот же файл → Start). Не удаляйте приложение при переподписи.

## Windows
```
npm install
npx electron .                               # запуск для проверки
npx electron-builder --win dir --x64         # упаковка
makensis build/installer.nsi                 # установщик
```
