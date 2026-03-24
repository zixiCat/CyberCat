#define AppName "CyberCat"
#ifndef AppVersion
  #define AppVersion "0.1.1"
#endif
#ifndef BundleSourceDir
  #define BundleSourceDir "build\\CyberCat\\bundle\\CyberCat"
#endif

[Setup]
AppId={{E4358746-449C-47D1-933E-C5251E3605A1}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=CyberCat
DefaultDirName={userpf}\{#AppName}
DefaultGroupName={#AppName}
DisableDirPage=no
DisableProgramGroupPage=yes
OutputDir=../build/CyberCat/installer
OutputBaseFilename=CyberCat-setup-{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\CyberCat.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#BundleSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\CyberCat.exe"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\CyberCat.exe"

[Run]
Filename: "{app}\CyberCat.exe"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent