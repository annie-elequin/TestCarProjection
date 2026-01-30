# Example apps for react-native-car-projection

These apps demonstrate the three supported app types. Each runs on both iOS and Android.

| App | Config | Description |
|-----|--------|-------------|
| **TestCarAppOnly** | `mediaSupport: false`, `mediaOnly: false`, `carAppCategory: "navigation"` | Car App only (no MediaBrowserService). Template UI on Android Auto. |
| **TestCarAppPlusMedia** | `mediaSupport: true`, `mediaOnly: false` | Car App + MediaBrowserService. Template UI and now-playing slot. |
| **TestMediaOnly** | `mediaOnly: true`, `mediaSupport: true` | Media only (no Car App). Browse + now-playing, like Spotify. |

## Running an example

From the repo root (or from this directory):

```bash
cd examples/TestCarAppOnly   # or TestCarAppPlusMedia, TestMediaOnly
npm install
npx expo prebuild --clean
npx expo run:android         # or npx expo run:ios
```

**Note:** These examples use the local `react-native-car-projection` package via `file:../../../react-native-car-projection`. Ensure the `react-native-car-projection` package is cloned as a sibling of the TestAndroidAuto repo (e.g. same parent directory).
