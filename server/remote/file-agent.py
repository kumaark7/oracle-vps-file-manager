import base64
import json
import os
import shutil
import stat
import sys
import tempfile
import zipfile
from pathlib import Path

operation = sys.argv[1]
root = os.path.realpath(sys.argv[2])
payload = json.loads(base64.urlsafe_b64decode(sys.argv[3].encode("ascii") + b"===").decode("utf-8"))


def fail(message):
    sys.stderr.write(json.dumps({"error": str(message)}))
    sys.exit(1)


def inside_root(absolute):
    return absolute == root or absolute.startswith(root + os.sep)


def safe_name(name):
    clean = str(name or "").strip()
    if not clean or "/" in clean or "\\" in clean or "\x00" in clean or clean in (".", ".."):
        fail("Invalid file or folder name")
    return clean


def resolve_path(remote_path="/", follow_final=True):
    requested = str(remote_path or "/").replace("\\", "/")
    if "\x00" in requested or ".." in requested.split("/"):
        fail("Invalid path")
    parts = [part for part in requested.split("/") if part not in ("", ".")]
    if not parts:
        return root
    lexical = os.path.join(root, *parts)
    parent = os.path.realpath(os.path.dirname(lexical))
    if not inside_root(parent):
        fail("Path is outside the configured file root")
    absolute = os.path.realpath(lexical) if follow_final else os.path.join(parent, os.path.basename(lexical))
    if not inside_root(absolute):
        fail("Path is outside the configured file root")
    return absolute


def to_virtual_path(absolute):
    relative = os.path.relpath(absolute, root).replace("\\", "/")
    return "/" if relative == "." else "/" + relative


def parent_path(remote_path):
    if not remote_path or remote_path == "/":
        return "/"
    clean = str(remote_path).rstrip("/")
    index = clean.rfind("/")
    return "/" if index <= 0 else clean[:index]


def detect_category(file_name):
    extension = Path(file_name).suffix.lower()
    if extension in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"}:
        return "images"
    if extension in {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}:
        return "videos"
    if extension in {".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"}:
        return "documents"
    return "others"


def empty_usage():
    return {"totalSize": 0, "categories": {"documents": 0, "images": 0, "videos": 0, "others": 0}}


def scan_usage(start_path):
    result = empty_usage()
    pending = [start_path]
    while pending:
        current = pending.pop()
        try:
            item_stat = os.lstat(current)
            if stat.S_ISLNK(item_stat.st_mode):
                continue
            if stat.S_ISDIR(item_stat.st_mode):
                with os.scandir(current) as children:
                    pending.extend(child.path for child in children)
                continue
            size = item_stat.st_size
            category = detect_category(current) if stat.S_ISREG(item_stat.st_mode) else "others"
            result["totalSize"] += size
            result["categories"][category] += size
        except Exception:
            continue
    return result


def conflict_path(target_path):
    if not os.path.lexists(target_path):
        return target_path
    directory = os.path.dirname(target_path)
    extension = Path(target_path).suffix
    basename = Path(target_path).stem
    for index in range(1, 1000):
        suffix = " copy" if index == 1 else f" copy {index}"
        candidate = os.path.join(directory, basename + suffix + extension)
        if not os.path.lexists(candidate):
            return candidate
    fail(f"Could not find a free name for {os.path.basename(target_path)}")


def folder_source(remote_path):
    if not remote_path or remote_path == "/":
        fail("The configured file root cannot be archived")
    absolute = resolve_path(remote_path, follow_final=False)
    item_stat = os.lstat(absolute)
    if stat.S_ISLNK(item_stat.st_mode) or not stat.S_ISDIR(item_stat.st_mode):
        fail("Only folders can be archived")
    if not inside_root(os.path.realpath(absolute)):
        fail("Path is outside the configured file root")
    return absolute


def add_folder_to_zip(zip_handle, source):
    root_name = os.path.basename(source.rstrip(os.sep))
    for current, directories, files in os.walk(source, topdown=True, followlinks=False):
        directories[:] = [name for name in directories if not os.path.islink(os.path.join(current, name))]
        relative = os.path.relpath(current, source).replace("\\", "/")
        archive_directory = root_name if relative == "." else f"{root_name}/{relative}"
        zip_handle.write(current, archive_directory)
        for file_name in files:
            absolute = os.path.join(current, file_name)
            item_stat = os.lstat(absolute)
            if stat.S_ISREG(item_stat.st_mode) and not stat.S_ISLNK(item_stat.st_mode):
                zip_handle.write(absolute, f"{archive_directory}/{file_name}")


def remove_path(remote_path):
    if remote_path == "/":
        fail("Refusing to delete the configured file root")
    absolute = resolve_path(remote_path, follow_final=False)
    item_stat = os.lstat(absolute)
    if stat.S_ISLNK(item_stat.st_mode) or stat.S_ISREG(item_stat.st_mode):
        os.unlink(absolute)
    elif stat.S_ISDIR(item_stat.st_mode):
        shutil.rmtree(absolute)
    else:
        os.unlink(absolute)


def copy_path(from_path, destination_directory):
    source = resolve_path(from_path, follow_final=False)
    target = conflict_path(os.path.join(destination_directory, os.path.basename(source)))
    if os.path.isdir(source) and not os.path.islink(source):
        shutil.copytree(source, target, symlinks=True)
    else:
        shutil.copy2(source, target, follow_symlinks=False)


def move_path(from_path, destination_directory):
    source = resolve_path(from_path, follow_final=False)
    target = conflict_path(os.path.join(destination_directory, os.path.basename(source)))
    try:
        os.rename(source, target)
    except OSError:
        copy_path(from_path, destination_directory)
        remove_path(from_path)


try:
    if operation == "list":
        absolute = resolve_path(payload.get("path", "/"))
        entries = []
        with os.scandir(absolute) as dirents:
            for entry in dirents:
                try:
                    full = os.path.join(absolute, entry.name)
                    item_stat = os.lstat(full)
                    entry_type = "directory" if stat.S_ISDIR(item_stat.st_mode) else "link" if stat.S_ISLNK(item_stat.st_mode) else "file"
                    entries.append({
                        "name": entry.name,
                        "path": to_virtual_path(full),
                        "type": entry_type,
                        "size": item_stat.st_size,
                        "mode": stat.filemode(item_stat.st_mode),
                        "modifiedTs": item_stat.st_mtime,
                    })
                except Exception:
                    continue
        print(json.dumps({"root": root, "path": to_virtual_path(absolute), "entries": entries}))
    elif operation == "details":
        remote_path = payload.get("path")
        absolute = resolve_path(remote_path, follow_final=False)
        item_stat = os.lstat(absolute)
        item_type = "Directory" if stat.S_ISDIR(item_stat.st_mode) else "Link" if stat.S_ISLNK(item_stat.st_mode) else "File"
        print(json.dumps({
            "name": os.path.basename(absolute),
            "type": item_type,
            "size": item_stat.st_size,
            "location": parent_path(remote_path),
            "path": absolute,
            "modifiedTs": item_stat.st_mtime,
            "lastUsedTs": item_stat.st_atime,
            "createdTs": getattr(item_stat, "st_birthtime", item_stat.st_ctime),
        }))
    elif operation == "storage":
        statv = os.statvfs(root)
        projects = []
        with os.scandir(root) as entries:
            for entry in entries:
                usage = scan_usage(entry.path)
                projects.append({
                    "name": entry.name,
                    "type": "folder" if entry.is_dir(follow_symlinks=False) else "file",
                    "size": usage["totalSize"],
                    "path": to_virtual_path(entry.path),
                })
        root_usage = scan_usage(root)
        projects.sort(key=lambda item: item["size"], reverse=True)
        print(json.dumps({
            "totalSpace": statv.f_blocks * statv.f_frsize,
            "usedSpace": (statv.f_blocks - statv.f_bfree) * statv.f_frsize,
            "availableSpace": statv.f_bavail * statv.f_frsize,
            "categories": root_usage["categories"],
            "projects": projects,
            "topProjects": projects[:8],
        }))
    elif operation == "read_stream":
        absolute = resolve_path(payload.get("path"))
        with open(absolute, "rb") as file_handle:
            shutil.copyfileobj(file_handle, sys.stdout.buffer, length=1024 * 1024)
    elif operation == "write_stream":
        absolute = resolve_path(payload.get("path"), follow_final=False)
        os.makedirs(os.path.dirname(absolute), exist_ok=True)
        with open(absolute, "wb") as file_handle:
            shutil.copyfileobj(sys.stdin.buffer, file_handle, length=1024 * 1024)
        print(json.dumps({"ok": True}), file=sys.stderr)
    elif operation == "zip_folder":
        source = folder_source(payload.get("path"))
        target = conflict_path(os.path.join(os.path.dirname(source), os.path.basename(source) + ".zip"))
        descriptor, temporary = tempfile.mkstemp(prefix=".ovfm-zip-", suffix=".tmp", dir=os.path.dirname(source))
        os.close(descriptor)
        os.chmod(temporary, 0o600)
        try:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zip_handle:
                add_folder_to_zip(zip_handle, source)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        print(json.dumps({"name": os.path.basename(target), "path": to_virtual_path(target)}))
    elif operation == "zip_stream":
        source = folder_source(payload.get("path"))
        with zipfile.ZipFile(sys.stdout.buffer, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zip_handle:
            add_folder_to_zip(zip_handle, source)
    elif operation == "mkdir":
        requested_path = payload.get("path")
        parent = resolve_path(parent_path(requested_path))
        os.makedirs(os.path.join(parent, safe_name(Path(requested_path).name)), exist_ok=True)
        print(json.dumps({"ok": True}))
    elif operation == "rename":
        source = resolve_path(payload.get("from"), follow_final=False)
        destination_parent = resolve_path(parent_path(payload.get("to")))
        os.rename(source, os.path.join(destination_parent, safe_name(Path(payload.get("to")).name)))
        print(json.dumps({"ok": True}))
    elif operation == "delete":
        remove_path(payload.get("path"))
        print(json.dumps({"ok": True}))
    elif operation == "delete_bulk":
        for item_path in payload.get("paths", []):
            remove_path(item_path)
        print(json.dumps({"ok": True}))
    elif operation == "paste":
        destination = resolve_path(payload.get("destination", "/"))
        items = payload.get("items", [])
        if not items:
            fail("No items selected")
        for item_path in items:
            if payload.get("operation") == "cut":
                move_path(item_path, destination)
            else:
                copy_path(item_path, destination)
        print(json.dumps({"ok": True}))
    else:
        fail("Unknown operation")
except Exception as error:
    fail(error)
