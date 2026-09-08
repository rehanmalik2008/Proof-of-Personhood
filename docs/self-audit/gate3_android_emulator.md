# Gate 3 — Android emulator path: attempted, blocked at SDK provisioning

`the-last-technical-frontier.md`, Task 3. The goal: run the existing adb-based
memory harness (`scripts/measure_phone_rss.mjs`) against Android Virtual Devices
capped at 2 GB and 3 GB RAM, capturing OS-level peak RSS via
`adb shell dumpsys meminfo` under the **real Android memory manager**
(`lowmemorykiller`, the Android allocator, real Chrome-on-Android per-tab budget)
— evidence the desktop cgroup cannot produce.

## Status: not completed. Blocked on network, not design.

The WSL2 environment has what the emulator needs:

- `/dev/kvm` present, `vmx` CPU flag exposed (nested virtualisation on)
- 931 GB free disk, 12 vCPUs, 7.8 GB RAM
- OpenJDK 17 installed cleanly

It does **not** have a working path to the Android SDK download endpoint. Every
attempt to fetch `commandlinetools-linux-*.zip` from `dl.google.com` **stalls at
~57 MB of ~120 MB and never completes** — reproduced across multiple runs,
including with `--connect-timeout 15 --retry 3` and a 120 s cap. `sdkmanager`
cannot run without cmdline-tools, so `platform-tools`, `emulator`, and the
`system-images;android-34;google_apis;x86_64` image (~1.5 GB, same endpoint) were
never reached. Setup script: `scripts/wsl_setup_avd.sh` (ready; fails at the
first download).

## What remains once the SDK is available

The script `scripts/wsl_setup_avd.sh` creates `avd2g` (2048 MB) and `avd3g`
(3072 MB) by writing `hw.ramSize` into each AVD's `config.ini`. The run would then
be, headless:

```bash
emulator -avd avd2g -no-window -no-audio -gpu swiftshader_indirect \
         -memory 2048 -netdelay none -netspeed full &
adb wait-for-device
# google_apis images ship a WebView but not Chrome; sideload a Chrome APK, or
# use a *_playstore image, then:
ADB=$ANDROID_SDK_ROOT/platform-tools/adb \
  node scripts/measure_phone_rss.mjs --rung w8d9        # + --load N for pressure
# repeat with -avd avd3g
```

`measure_phone_rss.mjs` is already emulator-agnostic: it drives everything over
`adb` (`dumpsys meminfo`, `VmHWM`, `adb reverse`, `am start`), serves `web/`
itself, and does not require root. The only emulator-specific wrinkle is getting
Chrome onto a `google_apis` image.

## What this can and cannot claim (unchanged from the note)

- **Can**, once run: "Under a 2 GB / 3 GB Android environment with the real
  Android memory manager, peak RSS was X and the prover tab [survived / was
  killed]." Materially stronger than the desktop cgroup (pass at 336 MB, OOM at
  320 MB, `mem_ceiling_results.txt`).
- **Cannot**: close Gate 3. The gate names a physical device; an emulator does
  not reproduce mobile memory bandwidth, thermals, or OEM memory policy. The
  label would move from "simulated on the wrong OS" to "measured on the right OS,
  pending physical hardware" — a real advance, still not closure.

## Recommendation

Run `scripts/wsl_setup_avd.sh` + the commands above on a host with unrestricted
access to `dl.google.com` (any ordinary Linux box or a GitHub Actions runner),
or on the physical `≤3 GB` handset the gate ultimately requires (~$40, the
cheapest remaining path to actual closure).
