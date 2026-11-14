// После упаковки: ставим иконку-самолётик и сведения о программе в Plannner.exe
// (делаем на JS через resedit, чтобы не требовался Wine при сборке на Linux)
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit').then((m) => m.default || m);
  const exePath = path.join(context.appOutDir, 'PLNR.exe');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '../build/icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

  const version = context.packager.appInfo.version;
  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const parts = version.split('.').map(Number);
  vi.setFileVersion(parts[0], parts[1], parts[2], 0, 1033);
  vi.setProductVersion(parts[0], parts[1], parts[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'PLNR',
    ProductName: 'PLNR',
    CompanyName: 'borgni',
    LegalCopyright: '© 2026 borgni',
    OriginalFilename: 'PLNR.exe',
    InternalName: 'PLNR',
    FileVersion: version,
    ProductVersion: version,
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • иконка и сведения записаны в', path.basename(exePath));
};
