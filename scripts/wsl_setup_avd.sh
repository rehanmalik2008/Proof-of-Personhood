#!/bin/bash
# Android SDK cmdline-tools + emulator + Google-APIs x86_64 system image in WSL,
# then AVDs avd2g / avd3g (2 GB / 3 GB RAM) for the Gate 3 emulator path
# (the-last-technical-frontier.md, Task 3). Absolute paths throughout: this box's
# `wsl.exe -- bash -lc` sessions have shown an inconsistent $HOME.
set -eu
SDK=/root/android-sdk
API=34
IMG="system-images;android-${API};google_apis;x86_64"
JH=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")
export ANDROID_SDK_ROOT="$SDK" ANDROID_HOME="$SDK" JAVA_HOME="$JH"
SM="$SDK/cmdline-tools/latest/bin/sdkmanager"
AM="$SDK/cmdline-tools/latest/bin/avdmanager"
echo "JAVA_HOME=$JAVA_HOME  ($(java -version 2>&1 | head -1))"

echo "== apt deps =="
sudo apt-get install -y -qq openjdk-17-jdk-headless unzip curl \
  libpulse0 libnss3 libxcursor1 libxdamage1 libxcomposite1 libxi6 libxtst6 \
  libgl1 libglx-mesa0 2>&1 | tail -1 || true

echo "== cmdline-tools (clean) =="
rm -rf "$SDK/cmdline-tools"
mkdir -p "$SDK/cmdline-tools"
cd /tmp && rm -rf cmdline-tools cmdtools.zip
curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
unzip -q cmdtools.zip
mkdir -p "$SDK/cmdline-tools/latest"
mv cmdline-tools/* "$SDK/cmdline-tools/latest/"
test -x "$SM" || { echo "FATAL: sdkmanager not at $SM"; ls -R "$SDK/cmdline-tools" | head; exit 1; }

echo "== licenses =="
yes | "$SM" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true

echo "== install platform-tools + emulator + image ($IMG) =="
"$SM" --sdk_root="$SDK" --install "platform-tools" "emulator" "$IMG" 2>&1 \
  | grep -vE "^\[=+|Unzipping|^\s*$" | tail -12

ADB="$SDK/platform-tools/adb"; EMU="$SDK/emulator/emulator"
test -x "$ADB" || { echo "FATAL: adb missing"; exit 1; }
test -x "$EMU" || { echo "FATAL: emulator missing"; exit 1; }

echo "== create AVDs =="
for spec in avd2g:2048 avd3g:3072; do
  name="${spec%%:*}"; ram="${spec##*:}"
  echo "no" | "$AM" create avd -n "$name" -k "$IMG" --device "pixel_5" --force 2>&1 | tail -1
  ini="/root/.android/avd/$name.avd/config.ini"
  if [ -f "$ini" ]; then
    grep -q '^hw.ramSize=' "$ini" && sed -i "s/^hw.ramSize=.*/hw.ramSize=$ram/" "$ini" || echo "hw.ramSize=$ram" >> "$ini"
    grep -q '^hw.lcd.density=' "$ini" || echo "hw.lcd.density=440" >> "$ini"
    echo "  $name: $(grep '^hw.ramSize=' "$ini")"
  else
    echo "  WARN: $ini not created"
  fi
done

echo "== versions =="
"$ADB" --version | head -1
"$EMU" -version 2>&1 | head -1
"$AM" list avd -c 2>/dev/null
echo "DONE"
