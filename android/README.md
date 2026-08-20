# Android APK Project

This folder contains a simple Android WebView app for the live Oracle VPS File Manager:

```text
<<<<<<< HEAD
http://YOUR_SERVER_IP/
=======
http://144.24.158.211/
>>>>>>> cf15088 (Sync live VPS code)
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
<<<<<<< HEAD
<project-folder>\android
=======
C:\Users\hemachandiran\Documents\New project\android
>>>>>>> cf15088 (Sync live VPS code)
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
<<<<<<< HEAD
- Before building, update `MainActivity.java` with your live app URL.
- If you use plain `http`, also update `network_security_config.xml` with your server host.
- If you later move to `https`, remove the cleartext exception or switch it to your secure domain.
=======
- Because your live app currently uses `http`, the Android app enables cleartext traffic for `144.24.158.211`.
- If you later move to `https`, update `MainActivity.java` and `network_security_config.xml`.
>>>>>>> cf15088 (Sync live VPS code)
