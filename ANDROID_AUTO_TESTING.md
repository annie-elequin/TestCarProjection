# Android Auto Testing Guide

## Quick Start

### Step 1: Prebuild native code
Since Android Auto requires native modules, you need to generate the native Android project:

```bash
npx expo prebuild --clean
```

### Step 2: Run on Android device/emulator

**Option A: Development build (recommended)**
```bash
npx expo run:android
```

**Option B: Start Expo dev server and build separately**
```bash
# Terminal 1: Start Metro bundler
npm start

# Terminal 2: Build and run
npx expo run:android
```

## Testing Android Auto

### Option 1: Android Auto Desktop Head Unit (Recommended for Development)
1. Install [AA Desktop Head Unit](https://github.com/martoreto/aauto-vex-vag) on your computer
2. Connect your Android device via USB
3. Enable USB debugging on your device
4. Run the app on your device: `npx expo run:android`
5. Launch AA Desktop Head Unit to see your app in Android Auto interface

### Option 2: Physical Android Auto Device
1. Connect your Android phone to an Android Auto compatible car/head unit
2. Launch your app on the phone
3. Your app should appear in Android Auto

### Option 3: Android Emulator (Limited Support)
- Android Auto doesn't work well in emulators
- Use a physical device or AA Desktop Head Unit instead

## What to Expect

When you run the app:
- The app will register a test screen with 2 items
- When connected to Android Auto, you should see "Android Auto Test" screen
- Check console logs for: "Android Auto session started!" and screen change events

## Troubleshooting

### Build errors
- Make sure you have Android SDK installed
- Check that `npx expo prebuild` completed successfully
- Try `npx expo prebuild --clean` to start fresh

### Android Auto not showing app
- Verify the plugin is in `app.json` (already configured)
- Ensure the app is installed on the device
- Restart Android Auto after installing the app
- Check device logs: `adb logcat | grep -i "androidauto\|carapp"`

### Module not found
- Make sure the local package is built: `cd ../react-native-android-auto && npm run build`
- Reinstall: `npm install` in the test app directory
