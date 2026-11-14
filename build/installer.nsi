; Установщик PLNR для Windows (NSIS, без прав администратора)
Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64
RequestExecutionLevel user
ManifestDPIAware true

!define APPNAME "PLNR"
!define EXENAME "PLNR.exe"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Plannner"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif

Name "${APPNAME}"
Caption "Установка — ${APPNAME}"
BrandingText "${APPNAME} ${VERSION}"
OutFile "..\dist\PLNR-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Plannner"
InstallDirRegKey HKCU "Software\Plannner" "InstallDir"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1049 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1049 "FileDescription" "Установка ${APPNAME}"
VIAddVersionKey /LANG=1049 "CompanyName" "borgni"
VIAddVersionKey /LANG=1049 "LegalCopyright" "© 2026 borgni"
VIAddVersionKey /LANG=1049 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1049 "ProductVersion" "${VERSION}"

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "installer-side.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "installer-side.bmp"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Установка PLNR"
!define MUI_WELCOMEPAGE_TEXT "PLNR — ваш день, календарь и дела в одном окне.$\r$\n$\r$\nПрограмма ставится только для вашей учётной записи и не требует прав администратора.$\r$\n$\r$\nНажмите «Далее», чтобы продолжить."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Готово!"
!define MUI_FINISHPAGE_TEXT "PLNR установлен. Ярлык с планером появился на рабочем столе и в меню «Пуск»."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить PLNR"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Russian"

Section "PLNR" SecMain
  ; закрыть приложение, если запущено (при обновлении)
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  nsExec::Exec 'taskkill /IM "Plannner.exe" /F'
  Sleep 400

  ; убрать следы прежнего названия «Планнер»
  Delete "$INSTDIR\Plannner.exe"
  Delete "$DESKTOP\Планнер.lnk"
  Delete "$SMPROGRAMS\Планнер.lnk"

  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "..\dist\win-unpacked\*.*"

  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Plannner" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "borgni"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  Sleep 400
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  ; автозапуск (если включали в старых версиях)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.borgni.plannner"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\Plannner"
  ; ваши дела (папка %APPDATA%\PLNR) не удаляются — они останутся при переустановке
SectionEnd
