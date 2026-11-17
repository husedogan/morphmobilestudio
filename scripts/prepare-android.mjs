import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const androidDir = path.join(root, 'android');

if (!fs.existsSync(androidDir)) {
  console.log('android/ directory not found; run "npx cap add android" first.');
  process.exit(0);
}

// 1. Patch AndroidManifest.xml with cleartext LAN support, Morph label, and media/storage permissions
const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  if (!manifest.includes('android:usesCleartextTraffic=')) {
    manifest = manifest.replace('<application', '<application android:usesCleartextTraffic="true"');
  }

  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  ];

  for (const perm of permissions) {
    const nameMatch = perm.match(/android:name="([^"]+)"/);
    if (nameMatch && !manifest.includes(nameMatch[1])) {
      manifest = manifest.replace('</manifest>', `    ${perm}\n</manifest>`);
    }
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('Patched AndroidManifest.xml');
}

// 2. Enforce app_name & title_activity_main = "Morph" (never "Morph Studio") in strings.xml
const resDir = path.join(androidDir, 'app', 'src', 'main', 'res');
const stringsPath = path.join(resDir, 'values', 'strings.xml');
if (fs.existsSync(stringsPath)) {
  let stringsXml = fs.readFileSync(stringsPath, 'utf8');
  stringsXml = stringsXml.replace(
    /<string name="app_name">[^<]*<\/string>/g,
    '<string name="app_name">Morph</string>'
  );
  stringsXml = stringsXml.replace(
    /<string name="title_activity_main">[^<]*<\/string>/g,
    '<string name="title_activity_main">Morph</string>'
  );
  fs.writeFileSync(stringsPath, stringsXml, 'utf8');
  console.log('Set Android app_name and title_activity_main to "Morph"');
}

// 3. Ensure adaptive icon background color (#0A1629) exists in values/colors.xml and ic_launcher_background.xml
const valuesDir = path.join(resDir, 'values');
if (fs.existsSync(valuesDir)) {
  const bgXmlPath = path.join(valuesDir, 'ic_launcher_background.xml');
  const colorsXmlPath = path.join(valuesDir, 'colors.xml');
  const bgXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A1629</color>\n</resources>\n`;
  if (fs.existsSync(bgXmlPath)) {
    fs.writeFileSync(bgXmlPath, bgXml, 'utf8');
  } else if (fs.existsSync(colorsXmlPath)) {
    let colors = fs.readFileSync(colorsXmlPath, 'utf8');
    if (colors.includes('name="ic_launcher_background"')) {
      colors = colors.replace(
        /<color name="ic_launcher_background">[^<]*<\/color>/g,
        '<color name="ic_launcher_background">#0A1629</color>'
      );
    } else {
      colors = colors.replace('</resources>', '    <color name="ic_launcher_background">#0A1629</color>\n</resources>');
    }
    fs.writeFileSync(colorsXmlPath, colors, 'utf8');
  } else {
    fs.writeFileSync(bgXmlPath, bgXml, 'utf8');
  }
}

// 4. Apply official lowercase "m" Morph launcher icons (densities + adaptive foreground)
const androidIconsSrc = path.join(root, 'public', 'android-icons');
if (fs.existsSync(androidIconsSrc) && fs.existsSync(resDir)) {
  for (const dirName of [
    'mipmap-mdpi',
    'mipmap-hdpi',
    'mipmap-xhdpi',
    'mipmap-xxhdpi',
    'mipmap-xxxhdpi',
    'mipmap-anydpi-v26',
    'drawable-nodpi',
  ]) {
    const srcSub = path.join(androidIconsSrc, dirName);
    if (!fs.existsSync(srcSub)) continue;
    const dstSub = path.join(resDir, dirName);
    fs.mkdirSync(dstSub, {recursive: true});
    for (const file of fs.readdirSync(srcSub)) {
      fs.copyFileSync(path.join(srcSub, file), path.join(dstSub, file));
    }
    // Remove default Capacitor ic_launcher_foreground.png inside mipmap-* if adaptive drawable-nodpi is used
    if (dirName.startsWith('mipmap-') && dirName !== 'mipmap-anydpi-v26') {
      const staleFg = path.join(dstSub, 'ic_launcher_foreground.png');
      if (fs.existsSync(staleFg)) {
        fs.rmSync(staleFg, {force: true});
      }
    }
  }
  console.log('Applied official lowercase "m" Morph icons to Android mipmap & adaptive resources');
}

// 5. Sync Morph version (e.g. 1.1.6 -> versionName "1.1.6", versionCode 10106)
const pkgPath = path.join(root, 'package.json');
const gradlePath = path.join(androidDir, 'app', 'build.gradle');
if (fs.existsSync(pkgPath) && fs.existsSync(gradlePath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const ver = String(pkg.version || '1.1.6').split('-')[0];
  const [maj = 1, min = 1, pat = 6] = ver.split('.').map((n) => parseInt(n, 10) || 0);
  const versionCode = maj * 10000 + min * 100 + pat;
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${ver}"`);
  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log(`Synced Android app version: ${ver} (versionCode ${versionCode})`);
}
