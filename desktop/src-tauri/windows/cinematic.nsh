; Presentation and maintenance policy for the pinned Tauri NSIS template.
!include nsDialogs.nsh
!define MUI_BGCOLOR "191A1D"
!define MUI_TEXTCOLOR "EEEEEE"
!define MUI_CUSTOMFUNCTION_GUIINIT CinematicGUIInit
; These handles must be declared before the callback functions reference them.
!define MUI_INSTFILESPAGE_COLORS "D7D9DF 191A1D"
!insertmacro MUI_INSTFILESPAGE_INTERFACE

Var CinematicDpi
Var CinematicNativeDpi
Var CinematicBackground
Var CinematicBitmap
Var CinematicFont
Var CinematicSmallFont
Var CinematicTitleFont
Var CinematicBrandFont
Var CinematicPathFont
Var CinematicDialog
Var CinematicPath
Var CinematicShortcut
Var CinematicShortcutState
Var CinematicMode
Var CinematicInstalledVersion
Var CinematicMessage
Var CinematicButton
Var CinematicLaunch
Var CinematicFieldTop
Var CinematicCheckTop
Var CinematicDialogTop
Var CinematicDialogHeight
Var CinematicHeaderClose
Var CinematicMicroFont

!macro CinematicFont Handle Name Size Weight
  IntOp $0 ${Size} * $CinematicDpi
  IntOp $0 $0 / 96
  IntOp $0 0 - $0
  System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${Weight}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "${Name}") p .s'
  Pop ${Handle}
!macroend

!macro CinematicStyle Handle Kind
  Push $7
  Push $8
  StrCpy $8 ${Handle}
  System::Call '"$PLUGINSDIR\cinematic-controls.dll"::StyleControl(p r8, i ${Kind}) i .r7'
  ${If} $7 != 1
    DetailPrint "Installer control styling failed (kind ${Kind}, window $8)."
    MessageBox MB_OK|MB_ICONSTOP "Could not initialize the installer controls."
    Abort
  ${EndIf}
  Pop $8
  Pop $7
!macroend

!macro CinematicPlace Handle X Y Width Height
  Push $8
  StrCpy $8 ${Handle}
  Push $0
  Push $1
  Push $2
  Push $3
  IntOp $0 ${X} * $CinematicDpi
  IntOp $0 $0 / 96
  IntOp $1 ${Y} * $CinematicDpi
  IntOp $1 $1 / 96
  IntOp $2 ${Width} * $CinematicDpi
  IntOp $2 $2 / 96
  IntOp $3 ${Height} * $CinematicDpi
  IntOp $3 $3 / 96
  System::Call 'user32::SetWindowPos(p r8, p 0, i r0, i r1, i r2, i r3, i 0x14)'
  Pop $3
  Pop $2
  Pop $1
  Pop $0
  Pop $8
!macroend

!macro CinematicLabel Parent X Y Width Height Text Font Color Background
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "${Text}", i 0x50000000, i 0, i 0, i 0, i 0, p ${Parent}, p 0, p 0, p 0) p .r9'
  SendMessage $9 ${WM_SETFONT} ${Font} 1
  SetCtlColors $9 "${Color}" "${Background}"
  !insertmacro CinematicPlace $9 ${X} ${Y} ${Width} ${Height}
!macroend

Function CinematicDetect
  StrCpy $CinematicMode "install"
  StrCpy $CinematicShortcutState ${BST_CHECKED}
  ${If} $NoShortcutMode = 1
    StrCpy $CinematicShortcutState ${BST_UNCHECKED}
  ${EndIf}
  ReadRegStr $CinematicInstalledVersion SHCTX "${UNINSTKEY}" "DisplayVersion"
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "UninstallString"
  ${If} $0 != ""
    ; An existing installation owns its path, even when /D was provided.
    Call RestorePreviousInstallLocation
    StrCpy $CinematicMode "repair"
    ${If} $CinematicInstalledVersion != ""
      nsis_tauri_utils::SemverCompare "${VERSION}" $CinematicInstalledVersion
      Pop $0
      ${If} $0 = 1
        StrCpy $CinematicMode "update"
      ${ElseIf} $0 = -1
        StrCpy $CinematicMode "blocked"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ; This product only ships NSIS. Do not silently replace an unrelated MSI install.
  Call FindWixInstall
  ${If} $R6 != ""
    StrCpy $CinematicMode "msi"
  ${EndIf}
  ${If} $CinematicMode == "blocked"
  ${OrIf} $CinematicMode == "msi"
    ${If} ${Silent}
    ${OrIf} $PassiveMode = 1
    ${OrIf} $UpdateMode = 1
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function CinematicGUIInit
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .r0'
  StrCpy $CinematicNativeDpi $0
  ${IfThen} $CinematicNativeDpi = 0 ${|} StrCpy $CinematicNativeDpi 96 ${|}
  ; Match the 660px preview at common display scales, growing above 125%.
  IntOp $CinematicDpi $CinematicNativeDpi * 4
  IntOp $CinematicDpi $CinematicDpi / 5
  ${IfThen} $CinematicDpi < 96 ${|} StrCpy $CinematicDpi 96 ${|}
  InitPluginsDir
  File /oname=$PLUGINSDIR\cinematic.bmp "${SILOLINK_INSTALLER_DIR}\generated\cinematic.bmp"
  File /oname=$PLUGINSDIR\cinematic-controls.dll "${SILOLINK_INSTALLER_DIR}\generated\cinematic-controls.dll"
  System::Call '"$PLUGINSDIR\cinematic-controls.dll"::StyleWindow(p $HWNDPARENT, i $CinematicDpi) i .r0'
  ${IfThen} $0 != 1 ${|} Quit ${|}
  IntOp $2 660 * $CinematicDpi
  IntOp $2 $2 / 96
  IntOp $3 606 * $CinematicDpi
  IntOp $3 $3 / 96
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -16) i .r4'
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -20) i .r5'
  System::Call '*(i 0, i 0, i r2, i r3) p .r6'
  System::Call 'user32::AdjustWindowRectExForDpi(p r6, i r4, i 0, i r5, i $CinematicNativeDpi)'
  System::Call '*$6(i .r0, i .r1, i .r2, i .r3)'
  System::Free $6
  IntOp $2 $2 - $0
  IntOp $3 $3 - $1
  System::Call 'user32::GetSystemMetrics(i 0) i .r0'
  System::Call 'user32::GetSystemMetrics(i 1) i .r1'
  IntOp $0 $0 - $2
  IntOp $0 $0 / 2
  IntOp $1 $1 - $3
  IntOp $1 $1 / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r0, i r1, i r2, i r3, i 0x14)'
  !insertmacro CinematicFont $CinematicFont "맑은 고딕" 13 400
  !insertmacro CinematicFont $CinematicSmallFont "맑은 고딕" 11 400
  !insertmacro CinematicFont $CinematicTitleFont "맑은 고딕" 28 600
  !insertmacro CinematicFont $CinematicBrandFont "Segoe UI" 15 600
  !insertmacro CinematicFont $CinematicPathFont "Segoe UI" 12 400
  !insertmacro CinematicFont $CinematicMicroFont "Segoe UI" 9 400
  ; Hide MUI's original header, separators and branding, keeping its real navigation.
  System::Call 'user32::GetWindow(p $HWNDPARENT, i 5) p .r0'
  ${DoWhile} $0 P<> 0
    ShowWindow $0 ${SW_HIDE}
    System::Call 'user32::GetWindow(p r0, i 2) p .r0'
  ${Loop}
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x5400000E, i 0, i 0, i 0, i 0, p $HWNDPARENT, p 0, p 0, p 0) p .s'
  Pop $CinematicBackground
  !insertmacro CinematicPlace $CinematicBackground 0 0 660 606
  ${NSD_SetStretchedImage} $CinematicBackground "$PLUGINSDIR\cinematic.bmp" $CinematicBitmap
  System::Call 'user32::SetWindowPos(p $CinematicBackground, p 1, i 0, i 0, i 0, i 0, i 0x13)'
  !insertmacro CinematicLabel $HWNDPARENT 72 18 200 26 "SiloLink" $CinematicBrandFont "F5F5F2" "141517"
  !insertmacro CinematicLabel $HWNDPARENT 526 23 62 20 "v${VERSION}" $CinematicSmallFont "AAADB5" "141517"
  !insertmacro CinematicLabel $HWNDPARENT 30 98 300 18 "YOUR CONTEXT. CONNECTED." $CinematicMicroFont "A6A9B0" "111214"
  !insertmacro CinematicLabel $HWNDPARENT 30 132 330 78 "$(slHero)" $CinematicTitleFont "F5F5F2" "111214"
  !insertmacro CinematicLabel $HWNDPARENT 30 238 300 48 "$(slDescription)" $CinematicFont "B2B5BD" "111214"
  !insertmacro CinematicLabel $HWNDPARENT 500 338 145 16 "S I L O L I N K  /  D E S K T O P" $CinematicMicroFont "B3B6BC" "transparent"
  !insertmacro CinematicLabel $HWNDPARENT 30 526 280 39 "DESKTOP APP$\r$\nWindows · ${ARCH}" $CinematicSmallFont "A6A9B0" "191A1D"
  !insertmacro CinematicLabel $HWNDPARENT 30 578 600 18 "$(slPreserve)" $CinematicSmallFont "93969F" "191A1D"
  GetDlgItem $CinematicHeaderClose $HWNDPARENT 2
  !insertmacro CinematicPlace $CinematicHeaderClose 600 13 32 32
  !insertmacro CinematicStyle $CinematicHeaderClose 7
FunctionEnd

Function CinematicNavigation
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  !insertmacro CinematicPlace $0 460 516 170 44
  SendMessage $0 ${WM_SETFONT} $CinematicFont 1
  !insertmacro CinematicStyle $0 1
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 2
  !insertmacro CinematicPlace $0 600 13 32 32
  SendMessage $0 ${WM_SETFONT} $CinematicSmallFont 1
  !insertmacro CinematicStyle $0 7
  ShowWindow $0 ${SW_SHOW}
FunctionEnd

Function CinematicWelcome
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
  nsDialogs::Create 1018
  Pop $CinematicDialog
  ${IfThen} $CinematicDialog == error ${|} Abort ${|}
  StrCpy $CinematicDialogTop 392
  StrCpy $CinematicDialogHeight 112
  ${If} $CinematicMode != "install"
    StrCpy $CinematicDialogTop 368
    StrCpy $CinematicDialogHeight 140
  ${EndIf}
  !insertmacro CinematicPlace $CinematicDialog 30 $CinematicDialogTop 600 $CinematicDialogHeight
  SetCtlColors $CinematicDialog "DDDEE3" "191A1D"
  Call CinematicNavigation
  StrCpy $CinematicMessage "$(slInstallLocation)"
  StrCpy $CinematicButton "$(slInstall)"
  StrCpy $CinematicFieldTop 24
  StrCpy $CinematicCheckTop 76
  ${If} $CinematicMode == "update"
    StrCpy $CinematicMessage "$(slUpdateMessage)"
    StrCpy $CinematicButton "$(slUpdate)"
  ${ElseIf} $CinematicMode == "repair"
    StrCpy $CinematicMessage "$(slRepairMessage)"
    StrCpy $CinematicButton "$(slRepair)"
  ${ElseIf} $CinematicMode == "blocked"
    StrCpy $CinematicMessage "$(slBlockedMessage)"
    StrCpy $CinematicButton "$(slExit)"
  ${ElseIf} $CinematicMode == "msi"
    StrCpy $CinematicMessage "$(slMsiMessage)"
    StrCpy $CinematicButton "$(slExit)"
  ${EndIf}
  ${If} $CinematicMode != "install"
    StrCpy $CinematicFieldTop 52
    StrCpy $CinematicCheckTop 104
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$CinematicButton"
  ${NSD_CreateLabel} 0 0 100% 42 "$CinematicMessage"
  Pop $0
  ${If} $CinematicMode == "install"
    !insertmacro CinematicPlace $0 0 0 600 22
  ${Else}
    !insertmacro CinematicPlace $0 0 0 600 42
  ${EndIf}
  SendMessage $0 ${WM_SETFONT} $CinematicFont 1
  SetCtlColors $0 "D7D9DF" "191A1D"
  ${If} $CinematicMode == "blocked"
  ${OrIf} $CinematicMode == "msi"
    nsDialogs::Show
    Return
  ${EndIf}
  ${NSD_CreateText} 0 48 85% 30 "$INSTDIR"
  Pop $CinematicPath
  !insertmacro CinematicPlace $CinematicPath 0 $CinematicFieldTop 514 40
  SendMessage $CinematicPath ${WM_SETFONT} $CinematicPathFont 1
  SetCtlColors $CinematicPath "D7D9DF" "222328"
  !insertmacro CinematicStyle $CinematicPath 5
  ${NSD_CreateButton} 87% 48 13% 30 "$(slChange)"
  Pop $0
  !insertmacro CinematicPlace $0 524 $CinematicFieldTop 76 40
  SendMessage $0 ${WM_SETFONT} $CinematicSmallFont 1
  !insertmacro CinematicStyle $0 2
  ${NSD_OnClick} $0 CinematicBrowse
  ${If} $CinematicMode != "install"
    SendMessage $CinematicPath ${EM_SETREADONLY} 1 0
    EnableWindow $0 0
  ${EndIf}
  ${NSD_CreateCheckbox} 0 91 100% 24 "$(createDesktop)"
  Pop $CinematicShortcut
  !insertmacro CinematicPlace $CinematicShortcut 0 $CinematicCheckTop 600 28
  SetCtlColors $CinematicShortcut "AEB0B8" "191A1D"
  SendMessage $CinematicShortcut ${WM_SETFONT} $CinematicSmallFont 1
  ${NSD_SetState} $CinematicShortcut $CinematicShortcutState
  !insertmacro CinematicStyle $CinematicShortcut 4
  ${If} $NoShortcutMode = 1
    EnableWindow $CinematicShortcut 0
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function CinematicBrowse
  nsDialogs::SelectFolderDialog "$(slInstallLocation)" "$INSTDIR"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $CinematicPath $0
  ${EndIf}
FunctionEnd

Function CinematicWelcomeLeave
  ${If} $CinematicMode == "blocked"
  ${OrIf} $CinematicMode == "msi"
    Quit
  ${EndIf}
  ${NSD_GetText} $CinematicPath $INSTDIR
  ${NSD_GetState} $CinematicShortcut $CinematicShortcutState
  ${If} $INSTDIR == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(slInvalidPath)"
    Abort
  ${EndIf}
  ; Retain NSIS's directory validation even though the directory page is custom.
  ; NSIS GetFullPathName requires an existing parent; Win32 also handles a new folder.
  System::Call 'kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w .r0, p 0) i .r2'
  ${GetRoot} "$0" $1
  ${If} $0 == ""
  ${OrIf} $0 == $1
  ${OrIf} $0 == "$1\"
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(slInvalidPath)"
    Abort
  ${EndIf}
  StrCpy $INSTDIR $0
FunctionEnd

Function CinematicProgressShow
  !insertmacro CinematicPlace $mui.InstFilesPage 30 392 600 112
  !insertmacro CinematicPlace $mui.InstFilesPage.Text 0 0 600 25
  !insertmacro CinematicPlace $mui.InstFilesPage.ProgressBar 0 39 600 6
  !insertmacro CinematicPlace $mui.InstFilesPage.ShowLogButton 0 70 120 25
  !insertmacro CinematicPlace $mui.InstFilesPage.Log 0 0 600 108
  SetCtlColors $mui.InstFilesPage "DDDEE3" "191A1D"
  SetCtlColors $mui.InstFilesPage.Text "B8BBC3" "191A1D"
  SendMessage $mui.InstFilesPage.ShowLogButton ${WM_SETFONT} $CinematicSmallFont 1
  !insertmacro CinematicStyle $mui.InstFilesPage.ShowLogButton 2
  System::Call 'uxtheme::SetWindowTheme(p $mui.InstFilesPage.Log, w "", w "")'
  SendMessage $mui.InstFilesPage.Log 0x1001 0 0x1D1A19
  SendMessage $mui.InstFilesPage.Log 0x1024 0 0xE3DEDD
  SendMessage $mui.InstFilesPage.Log 0x1026 0 0x1D1A19
  SendMessage $mui.InstFilesPage.Text ${WM_SETFONT} $CinematicFont 1
  System::Call 'uxtheme::SetWindowTheme(p $mui.InstFilesPage.ProgressBar, w "", w "")'
  SendMessage $mui.InstFilesPage.ProgressBar ${PBM_SETBARCOLOR} 0 0xECEFEF
  SendMessage $mui.InstFilesPage.ProgressBar ${PBM_SETBKCOLOR} 0 0x2B2B2B
  Call CinematicNavigation
  SetAutoClose true
FunctionEnd

Function CinematicProgressLeave
  IfAbort cinematic_progress_aborted
  ${If} $CinematicShortcutState = ${BST_CHECKED}
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}
  cinematic_progress_aborted:
FunctionEnd

Function CinematicFinish
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
  nsDialogs::Create 1018
  Pop $CinematicDialog
  !insertmacro CinematicPlace $CinematicDialog 30 392 600 112
  SetCtlColors $CinematicDialog "DDDEE3" "191A1D"
  Call CinematicNavigation
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$(slDone)"
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_SHOW}
  ${NSD_CreateLabel} 0 0 100% 48 "$(slFinished)"
  Pop $0
  SetCtlColors $0 "F5F5F2" "191A1D"
  SendMessage $0 ${WM_SETFONT} $CinematicFont 1
  ${NSD_CreateCheckbox} 0 76 100% 26 "$(slLaunch)"
  Pop $CinematicLaunch
  !insertmacro CinematicPlace $CinematicLaunch 0 76 600 28
  SetCtlColors $CinematicLaunch "AEB0B8" "191A1D"
  SendMessage $CinematicLaunch ${WM_SETFONT} $CinematicSmallFont 1
  ${NSD_SetState} $CinematicLaunch ${BST_CHECKED}
  !insertmacro CinematicStyle $CinematicLaunch 4
  nsDialogs::Show
FunctionEnd

Function CinematicFinishLeave
  ${NSD_GetState} $CinematicLaunch $0
  ${IfThen} $0 = ${BST_CHECKED} ${|} Call RunMainBinary ${|}
FunctionEnd

Function .onGUIEnd
  System::Call '"$PLUGINSDIR\cinematic-controls.dll"::ReleaseStyles(p $HWNDPARENT) i ?u'
  ${NSD_FreeImage} $CinematicBitmap
  System::Call 'gdi32::DeleteObject(p $CinematicFont)'
  System::Call 'gdi32::DeleteObject(p $CinematicSmallFont)'
  System::Call 'gdi32::DeleteObject(p $CinematicTitleFont)'
  System::Call 'gdi32::DeleteObject(p $CinematicBrandFont)'
  System::Call 'gdi32::DeleteObject(p $CinematicPathFont)'
  System::Call 'gdi32::DeleteObject(p $CinematicMicroFont)'
FunctionEnd
