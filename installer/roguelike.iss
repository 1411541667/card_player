#define AppName "异变独行"
#define AppId "8D4A2D5E-8E52-4E7B-9D4D-123456789001"
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\\release\\stage-" + AppVersion
#endif
#ifndef OutputDir
  #define OutputDir "..\\release"
#endif
[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\RoguelikeCardFramework
DefaultGroupName={#AppName}
OutputDir={#OutputDir}
OutputBaseFilename=Roguelike-Card-Framework-{#AppVersion}-Setup
SetupIconFile={#SourceDir}\launcher.ico
UninstallDisplayIcon={app}\GameLauncher.exe
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
Compression=lzma2
SolidCompression=yes
[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\GameLauncher.exe"
Name: "{group}\{#AppName}"; Filename: "{app}\GameLauncher.exe"
[Run]
Filename: "{app}\GameLauncher.exe"; Description: "启动{#AppName}"; Flags: nowait postinstall skipifsilent
