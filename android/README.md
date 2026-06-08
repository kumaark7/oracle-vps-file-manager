# Android APK Project

This folder contains a simple Android WebView app for the live Oracle VPS File Manager:

```text
http://144.24.158.211/
```

## What it does

- Opens the live VPS file manager inside an Android app
- Supports swipe-to-refresh
- Keeps normal web navigation inside the app
- Uses the phone back button for WebView history

## Open in Android Studio

1. Open Android Studio
2. Choose `Open`
3. Select:

```text
C:\Users\hemachandiran\Documents\New project\android
```

4. Let Android Studio install any missing SDK pieces
5. Build the APK from:

```text
Build > Build Bundle(s) / APK(s) > Build APK(s)
```

## Output APK

Android Studio will usually place the debug APK at:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## Notes

- This app points to the live server URL, not a bundled offline copy.
- Because your live app currently uses `http`, the Android app enables cleartext traffic for `144.24.158.211`.
- If you later move to `https`, update `MainActivity.java` and `network_security_config.xml`.
