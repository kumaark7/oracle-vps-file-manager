# Android APK Project

This folder contains a simple Android WebView app for the live Oracle VPS File Manager:

```text
https://files.projectdarkhope.xyz/
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
<project-folder>\android
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
- `MainActivity.java` uses the HTTPS production URL. Update it if your public URL changes.
