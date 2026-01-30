# Example apps for react-native-car-projection

These apps demonstrate the three supported app types. Each runs on both iOS and Android.

**Important:** Each example is a **separate app** with its own `app.json`, `package.json`, and (after prebuild) its **own native project** (`android/` and `ios/`). They do **not** share one Gradle build. The plugin config in each app’s `app.json` controls what gets added to that app’s Android build:

- **TestCarAppOnly** → only Car App Service (no MediaBrowserService) in that app’s manifest
- **TestCarAppPlusMedia** → Car App Service + MediaBrowserService in that app’s manifest
- **TestMediaOnly** → only MediaBrowserService (no Car App Service) in that app’s manifest

When you run `expo prebuild` inside an example folder, Expo generates that app’s native project with the right services for that app type.

| App | Config | Description |
|-----|--------|-------------|
| **TestCarAppOnly** | `mediaSupport: false`, `mediaOnly: false`, `carAppCategory: "navigation"` | Car App only (no MediaBrowserService). Template UI on Android Auto. |
| **TestCarAppPlusMedia** | `mediaSupport: true`, `mediaOnly: false` | Car App + MediaBrowserService. Template UI and now-playing slot. |
| **TestMediaOnly** | `mediaOnly: true`, `mediaSupport: true` | Media only (no Car App). Browse + now-playing, like Spotify. |

## Running an example

Each example is built and run **from its own folder**. You get a separate Gradle (and Xcode) project per app.

```bash
# Pick one example and cd into it
cd examples/TestCarAppOnly   # or TestCarAppPlusMedia, or TestMediaOnly

npm install
npx expo prebuild --clean    # generates this app's android/ and ios/ with the right plugin config
npx expo run:android         # or npx expo run:ios
```

To try a different app type, cd into that example’s folder and run the same steps there; it will have its own `android/` and `ios/` with the correct services for that type.

**Note:** These examples use the local `react-native-car-projection` package via `file:../../../react-native-car-projection`. Ensure `react-native-car-projection` is cloned as a sibling of the TestCarApp repo (e.g. same parent directory).
