import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const androidDir = path.join(root, 'android');

if (!fs.existsSync(androidDir)) {
  console.log('android/ directory not found; run "npx cap add android" first.');
  process.exit(0);
}

// 1. Patch AndroidManifest.xml with cleartext LAN support, legacy storage, extractNativeLibs (required for Python/yt-dlp .so), and full permissions
const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  if (!manifest.includes('android:usesCleartextTraffic=')) {
    manifest = manifest.replace('<application', '<application android:usesCleartextTraffic="true"');
  }
  if (!manifest.includes('android:requestLegacyExternalStorage=')) {
    manifest = manifest.replace('<application', '<application android:requestLegacyExternalStorage="true"');
  }
  if (manifest.includes('android:extractNativeLibs=')) {
    manifest = manifest.replace(/android:extractNativeLibs="[^"]*"/g, 'android:extractNativeLibs="true"');
  } else {
    manifest = manifest.replace('<application', '<application android:extractNativeLibs="true"');
  }

  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
    '<uses-permission android:name="android.permission.VIBRATE" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />',
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
  console.log('Patched AndroidManifest.xml with extractNativeLibs="true" and full Morph permissions');
}

// 2. Patch root android/build.gradle to add JitPack repository (required for NewPipeExtractor)
const rootGradlePath = path.join(androidDir, 'build.gradle');
if (fs.existsSync(rootGradlePath)) {
  let rootGradle = fs.readFileSync(rootGradlePath, 'utf8');
  if (!rootGradle.includes('jitpack.io')) {
    rootGradle = rootGradle.replace(
      /allprojects\s*\{\s*repositories\s*\{([\s\S]*?)\}/,
      (match, inner) => `allprojects {\n    repositories {${inner}        maven { url 'https://jitpack.io' }\n    }`
    );
    fs.writeFileSync(rootGradlePath, rootGradle, 'utf8');
    console.log('Added JitPack repository to android/build.gradle');
  }
}

// 3. Enforce app_name & title_activity_main = "Morph" (never "Morph Studio") in strings.xml
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

// 4. Ensure adaptive icon background color (#0A1629) exists in values/colors.xml and ic_launcher_background.xml
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

// 5. Apply official lowercase "m" Morph launcher icons (densities + adaptive foreground)
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
    if (dirName.startsWith('mipmap-') && dirName !== 'mipmap-anydpi-v26') {
      const staleFg = path.join(dstSub, 'ic_launcher_foreground.png');
      if (fs.existsSync(staleFg)) {
        fs.rmSync(staleFg, {force: true});
      }
    }
  }
  for (const staleRel of [
    ['drawable-v24', 'ic_launcher_foreground.xml'],
    ['drawable', 'ic_launcher_foreground.xml'],
    ['drawable', 'ic_launcher_background.xml'],
  ]) {
    const staleFile = path.join(resDir, ...staleRel);
    if (fs.existsSync(staleFile)) {
      fs.rmSync(staleFile, {force: true});
    }
  }
  console.log('Applied official lowercase "m" Morph icons to Android mipmap & adaptive resources');
}

// 6. Sync Morph version + monotonic versionCode + permanent morph-release.p12 signing + native download engines
const pkgPath = path.join(root, 'package.json');
const gradlePath = path.join(androidDir, 'app', 'build.gradle');
if (fs.existsSync(pkgPath) && fs.existsSync(gradlePath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const ver = String(pkg.version || '1.1.9').split('-')[0];
  const [maj = 1, min = 1, pat = 9] = ver.split('.').map((n) => parseInt(n, 10) || 0);
  const runNum = parseInt(process.env.GITHUB_RUN_NUMBER || '0', 10);
  const semverCode = maj * 100000 + min * 1000 + pat * 10;
  // Strictly monotonic on every CI build (always > legacy 10109) so Android allows seamless in-place updates
  const versionCode = runNum > 0 ? Math.max(200000 + runNum, semverCode + runNum) : semverCode;

  // Copy permanent signing keystore into android/app/morph-release.p12
  const keystoreSrc = path.join(root, 'scripts', 'android-signing', 'morph-release.p12');
  const keystoreDst = path.join(androidDir, 'app', 'morph-release.p12');
  const envKeystoreB64 = (process.env.MORPH_KEYSTORE_BASE64 || '').trim();
  if (envKeystoreB64) {
    fs.writeFileSync(keystoreDst, Buffer.from(envKeystoreB64, 'base64'));
    console.log('Wrote permanent signing keystore from MORPH_KEYSTORE_BASE64');
  } else if (fs.existsSync(keystoreSrc)) {
    fs.copyFileSync(keystoreSrc, keystoreDst);
    console.log('Copied permanent signing keystore scripts/android-signing/morph-release.p12 -> android/app/');
  }

  const storePass = process.env.MORPH_KEYSTORE_PASSWORD || 'morphstudio2026';
  const keyAlias = process.env.MORPH_KEY_ALIAS || 'morphkey';
  const keyPass = process.env.MORPH_KEY_PASSWORD || 'morphstudio2026';
  const hasKeystore = fs.existsSync(keystoreDst);

  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${ver}"`);

  // Filter native .so libraries to ARM 64-bit & 32-bit Android devices (excludes ~40 MB of unused desktop x86 emulator binaries)
  if (!gradle.includes('abiFilters')) {
    gradle = gradle.replace(
      /(versionName\s+"[^"]+")/,
      `$1\n        ndk {\n            abiFilters "arm64-v8a", "armeabi-v7a"\n        }`
    );
  }

  // Inject permanent signingConfigs + NIO coreLibraryDesugaring + legacy jniLibs packaging + META-INF conflict excludes
  if (!gradle.includes('coreLibraryDesugaringEnabled')) {
    const signingBlock = hasKeystore
      ? `    signingConfigs {
        morphRelease {
            storeFile file("morph-release.p12")
            storePassword "${storePass}"
            keyAlias "${keyAlias}"
            keyPassword "${keyPass}"
            storeType "PKCS12"
            enableV1Signing true
            enableV2Signing true
        }
    }
`
      : '';

    const androidExtras = `${signingBlock}    compileOptions {
        coreLibraryDesugaringEnabled true
    }
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
        resources {
            excludes += [
                '/META-INF/{AL2.0,LGPL2.1}',
                'META-INF/DEPENDENCIES',
                'META-INF/INDEX.LIST',
                'META-INF/LICENSE*',
                'META-INF/NOTICE*'
            ]
        }
    }
`;
    gradle = gradle.replace(/(\s*buildTypes\s*\{)/, `\n${androidExtras}$1`);
  }

  // Attach morphRelease permanent signature to both release and debug buildTypes so every APK shares the exact same certificate
  if (hasKeystore && !gradle.includes('signingConfigs.morphRelease')) {
    gradle = gradle.replace(
      /buildTypes\s*\{\s*release\s*\{/,
      `buildTypes {\n        debug {\n            signingConfig signingConfigs.morphRelease\n        }\n        release {\n            signingConfig signingConfigs.morphRelease`
    );
  }

  // Inject native download engine dependencies inside dependencies { ... }
  if (!gradle.includes('youtubedl-android')) {
    const engineDeps = `    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs_nio:2.1.5"
    compileOnly "com.google.code.findbugs:jsr305:3.0.2"
    implementation "io.github.junkfood02.youtubedl-android:library:0.18.1"
    implementation "com.github.teamnewpipe:NewPipeExtractor:v0.27.1"
`;
    gradle = gradle.replace(/dependencies\s*\{\s*\n/, `dependencies {\n${engineDeps}`);
  }

  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log(
    `Synced Android app version: ${ver} (versionCode ${versionCode}, permanentSigned=${hasKeystore}) + native download engines`
  );
}

// 7. Install MorphEnginesPlugin.java and register it in MainActivity.java before super.onCreate(...)
function findFileRecursive(dir, targetName) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, targetName);
      if (found) return found;
    } else if (entry.name === targetName) {
      return full;
    }
  }
  return null;
}

const javaSrcRoot = path.join(androidDir, 'app', 'src', 'main', 'java');
const pluginTemplatePath = path.join(root, 'scripts', 'android-plugin', 'MorphEnginesPlugin.java');
const mainActivityPath = findFileRecursive(javaSrcRoot, 'MainActivity.java');

if (mainActivityPath && fs.existsSync(pluginTemplatePath)) {
  const mainActivityContent = fs.readFileSync(mainActivityPath, 'utf8');
  const pkgMatch = mainActivityContent.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
  const appPkg = pkgMatch ? pkgMatch[1] : 'com.morphstudio.app';
  const pkgDir = path.dirname(mainActivityPath);

  // Write MorphEnginesPlugin.java with matching package declaration
  let pluginSrc = fs.readFileSync(pluginTemplatePath, 'utf8');
  pluginSrc = pluginSrc.replace(/^\s*package\s+[a-zA-Z0-9_.]+\s*;/m, `package ${appPkg};`);
  fs.writeFileSync(path.join(pkgDir, 'MorphEnginesPlugin.java'), pluginSrc, 'utf8');

  // Patch MainActivity.java to register MorphEnginesPlugin before super.onCreate(savedInstanceState)
  if (!mainActivityContent.includes('MorphEnginesPlugin')) {
    const updatedMain = `package ${appPkg};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MorphEnginesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
    fs.writeFileSync(mainActivityPath, updatedMain, 'utf8');
  }
  console.log(`Installed and registered MorphEnginesPlugin in ${appPkg}`);
}

const publicDir = path.join(root, 'public');
if (fs.existsSync(publicDir) && fs.existsSync(resDir)) {
  const outerFg = path.join(publicDir, 'ic_launcher_foreground.png');
  if (fs.existsSync(outerFg)) {
    const drawableNodpi = path.join(resDir, 'drawable-nodpi');
    fs.mkdirSync(drawableNodpi, {recursive: true});
    fs.copyFileSync(outerFg, path.join(drawableNodpi, 'ic_launcher_foreground.png'));
  }
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const mipmapDir = path.join(resDir, `mipmap-${density}`);
    fs.mkdirSync(mipmapDir, {recursive: true});
    const srcLauncher = path.join(publicDir, `ic_launcher_${density}.png`);
    const srcRound = path.join(publicDir, `ic_launcher_round_${density}.png`);
    if (fs.existsSync(srcLauncher)) {
      fs.copyFileSync(srcLauncher, path.join(mipmapDir, 'ic_launcher.png'));
    }
    if (fs.existsSync(srcRound)) {
      fs.copyFileSync(srcRound, path.join(mipmapDir, 'ic_launcher_round.png'));
    }
  }
  console.log('Applied exact Morph outer launcher icons from public/');
}
