"""Run only a fresh synthetic headless Zen profile; never attach to another process.

Usage: python tests/native/probe.py --sine-source <test-profile/chrome> --script tests/native/candidate.js
Outputs and the disposable profile live under .backup-scratch/native/.
"""
import argparse
import json
from pathlib import Path
import shutil
import socket
import subprocess
import time
import uuid
import struct
import zlib
import zipfile

ROOT = Path(__file__).resolve().parents[2]


class Marionette:
    def __init__(self, connection):
        self.connection = connection
        self.counter = 0
        self.read()

    def read(self):
        size = b""
        while not size.endswith(b":"):
            chunk = self.connection.recv(1)
            if not chunk:
                raise RuntimeError("Marionette disconnected")
            size += chunk
        remaining = int(size[:-1])
        chunks = []
        while remaining:
            chunk = self.connection.recv(remaining)
            if not chunk:
                raise RuntimeError("Marionette disconnected during response")
            chunks.append(chunk)
            remaining -= len(chunk)
        return json.loads(b"".join(chunks))

    def command(self, name, parameters=None):
        self.counter += 1
        payload = json.dumps([0, self.counter, name, parameters or {}]).encode()
        self.connection.sendall(str(len(payload)).encode() + b":" + payload)
        result = self.read()
        if result[2]:
            raise RuntimeError(json.dumps(result[2]))
        return result[3]


def restart_check(run, profile, port, script):
    """Restart only the disposable profile created by this invocation."""
    command = [r"C:\Program Files\Zen Browser\zen.exe", "-headless", "-no-remote", "-profile", str(profile), "-marionette", "-remote-allow-system-access", "about:blank"]
    with (run / "restart-stdout.log").open("wb") as out, (run / "restart-stderr.log").open("wb") as err:
        process = subprocess.Popen(command, cwd=run, stdout=out, stderr=err)
        connection = None
        try:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"Disposable restart exited: {process.returncode}")
                try:
                    connection = socket.create_connection(("127.0.0.1", port), timeout=1)
                    break
                except OSError:
                    time.sleep(.25)
            if connection is None:
                raise RuntimeError("Disposable restart timeout")
            connection.settimeout(90)
            client = Marionette(connection)
            client.command("WebDriver:NewSession", {"capabilities": {}})
            client.command("Marionette:SetContext", {"value": "chrome"})
            client.command("WebDriver:SetTimeouts", {"script": 60000})
            result = client.command("WebDriver:ExecuteAsyncScript", {"script": script.read_text(encoding="utf-8"), "args": [], "newSandbox": False, "sandbox": "system"})
            return result.get("value", result)
        finally:
            if connection:
                connection.close()
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sine-source", required=True, type=Path)
    parser.add_argument("--script", required=True, type=Path)
    parser.add_argument("--package", type=Path, default=ROOT / "dist/sine/zen-icons")
    parser.add_argument("--bzf-source", type=Path)
    parser.add_argument("--load-order", choices=["icons-first", "folders-first"], default="icons-first")
    parser.add_argument("--pointer-check", action="store_true")
    parser.add_argument("--keyboard-check", action="store_true")
    parser.add_argument("--custom-fixtures", type=Path)
    parser.add_argument("--controls-check", action="store_true")
    parser.add_argument("--ui-scale", choices=["1", "2"])
    parser.add_argument("--restart-script", type=Path)
    parser.add_argument("--stock-update-fixture", action="store_true")
    parser.add_argument("--preseed-persistent", action="store_true")
    args = parser.parse_args()
    source = args.sine_source.resolve()
    if not (source / "JS/sine.sys.mjs").is_file() or not (source / "utils/chrome.manifest").is_file():
        raise RuntimeError("Source must contain Sine bootstrap JS and utils only")
    run = ROOT / ".backup-scratch/native" / uuid.uuid4().hex
    profile = run / "profile"
    chrome = profile / "chrome"
    chrome.mkdir(parents=True)
    for directory in ["JS", "utils"]:
        shutil.copytree(source / directory, chrome / directory)
    mods = chrome / "sine-mods"
    mods.mkdir()
    package = args.package.resolve()
    inventory = json.loads((package / "package-inventory.json").read_text(encoding="utf-8"))
    import hashlib
    for name, expected in inventory["files"].items():
        data = (package / name).read_bytes()
        if len(data) != expected["size"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
            raise RuntimeError("Package inventory mismatch: " + name)
    shutil.copytree(package, mods / "zen-icons-local")
    if args.stock_update_fixture:
        # Only archive transport is synthetic. Native Sine syncModData,
        # archive extraction, monorepo normalization and rebuild remain real.
        with zipfile.ZipFile(profile / "synthetic-repository.zip", "w", zipfile.ZIP_DEFLATED) as archive:
            for file in package.rglob("*"):
                if file.is_file():
                    archive.write(file, "Zen-Mods-main/zen-icons/" + file.relative_to(package).as_posix())
            archive.writestr("Zen-Mods-main/other-mod/theme.json", '{"id":"synthetic-other-mod"}')
    theme = json.loads((package / "theme.json").read_text(encoding="utf-8"))
    theme.update(enabled=True, origin="local", **{"no-updates": True})
    entries = {theme["id"]: theme}
    if args.bzf_source:
        bzf_theme = json.loads((args.bzf_source / "theme.json").read_text(encoding="utf-8"))
        bzf_theme.update(enabled=True, origin="local", **{"no-updates": True})
        target = mods / bzf_theme["id"]
        target.mkdir()
        for name in ["theme.json", "chrome.css", "preferences.json", "scripts/better-zen-folders.uc.mjs"]:
            destination = target / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(args.bzf_source / name, destination)
        entries[bzf_theme["id"]] = bzf_theme
        if args.load_order == "folders-first":
            entries = dict(reversed(list(entries.items())))
    (mods / "mods.json").write_text(json.dumps(entries), encoding="utf-8")
    (mods / "chrome.css").write_text("\n".join('@import "' + (mods / key / "chrome.css").as_uri() + '";' for key in entries), encoding="utf-8")
    (mods / "content.css").write_text("", encoding="utf-8")
    # Tiny valid PNG fixtures, created deterministically without external downloads.
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 6, 2, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress((b"\x00" + b"\xff\x90\x00\xff" * 6) * 2)) + chunk(b"IEND", b"")
    custom = mods / "zen-icons-local/custom"
    for relative in ["Native Pack/Animals/fish.png", "Native Pack/Animals/Category Icon.png", "Other Pack/animals/bird.png", "Native Pack/Default/sample.png"]:
        target = custom / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(png)
    (custom / "Native Pack/icons.json").write_text(json.dumps({"$categories": {"Animals": {"icon": "🐟", "aliases": ["nativefauna"]}},
        "Animals/fish.png": {"name": "Native Test Fish", "tags": ["nativeaquacheck"]}}), encoding="utf-8")
    if args.custom_fixtures:
        shutil.copytree(args.custom_fixtures.resolve(), custom, dirs_exist_ok=True)
    if args.preseed_persistent:
        shutil.copytree(custom, profile / "zen-icon-packs")
        # This directory was generated immediately above, inside this invocation.
        shutil.rmtree(custom)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    prefs = {
        "marionette.port": port,
        "marionette.enabled": True,
        "toolkit.legacyUserProfileCustomizations.stylesheets": True,
        "sine.allow-unsafe-js": True,
        "sine.mods.disable-all": False,
        "sine.check-for-updates": False,
        "sine.auto-update": False,
        "sine.mods.auto-update": False,
        "sine.engine.auto-update": False,
        "browser.shell.checkDefaultBrowser": False,
        "browser.startup.homepage": "about:blank",
        "browser.startup.page": 3,
        "browser.sessionstore.restore_on_demand": False,
        "browser.aboutwelcome.enabled": False,
        "browser.tabs.warnOnClose": False,
        "better-zen-folders.folder-url-pins-consent-version": 1,
        "zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url": False,
        "network.proxy.type": 1,
        "network.proxy.http": "127.0.0.1",
        "network.proxy.http_port": 9,
        "network.proxy.ssl": "127.0.0.1",
        "network.proxy.ssl_port": 9,
        "network.proxy.no_proxies_on": "",
        "network.trr.mode": 5,
        "app.update.auto": False,
        "zen.welcome-screen.seen": True,
        "datareporting.policy.dataSubmissionPolicyBypassNotification": True,
    }
    if args.ui_scale:
        prefs["layout.css.devPixelsPerPx"] = args.ui_scale
    (profile / "user.js").write_text("\n".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});" for k, v in prefs.items()), encoding="utf-8")
    executable = Path(r"C:\Program Files\Zen Browser\zen.exe")
    result = {"result": "failed", "profile": str(profile), "packageVersion": theme["version"], "mods": list(entries), "loadOrder": args.load_order,
              "packageInventorySha256": hashlib.sha256((package / "package-inventory.json").read_bytes()).hexdigest()}
    if args.bzf_source:
        result["bzfHashes"] = {name: hashlib.sha256((args.bzf_source / name).read_bytes()).hexdigest()
                               for name in ["theme.json", "chrome.css", "preferences.json", "scripts/better-zen-folders.uc.mjs"]}
    print(json.dumps({"phase": "starting", "run": str(run)}), flush=True)
    with (run / "stdout.log").open("wb") as stdout, (run / "stderr.log").open("wb") as stderr:
        process = subprocess.Popen([str(executable), "-headless", "-no-remote", "-profile", str(profile), "-marionette", "-remote-allow-system-access", "about:blank"],
                                   cwd=run, stdout=stdout, stderr=stderr)
        connection = None
        try:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"Disposable Zen exited at startup: {process.returncode}")
                try:
                    connection = socket.create_connection(("127.0.0.1", port), timeout=1)
                    break
                except OSError:
                    time.sleep(0.25)
            if connection is None:
                raise RuntimeError("Disposable Zen Marionette startup timeout")
            connection.settimeout(180)
            client = Marionette(connection)
            client.command("WebDriver:NewSession", {"capabilities": {}})
            client.command("Marionette:SetContext", {"value": "chrome"})
            client.command("WebDriver:SetTimeouts", {"script": 150000})
            print(json.dumps({"phase": "testing", "run": str(run)}), flush=True)
            result["checks"] = client.command("WebDriver:ExecuteAsyncScript", {
                "script": args.script.read_text(encoding="utf-8"), "args": [], "newSandbox": False, "sandbox": "system"})
            if isinstance(result["checks"], dict) and "value" in result["checks"]:
                result["checks"] = result["checks"]["value"]
            if args.keyboard_check and result["checks"].get("passed"):
                from keyboard import run as run_keyboard
                keyboard = run_keyboard(client)
                result["keyboard"] = keyboard
                if not keyboard.get("passed"):
                    result["checks"]["passed"] = False
            if args.controls_check and result["checks"].get("passed"):
                from controls import run as run_controls
                result["controls"] = run_controls(client)
                if not result["controls"].get("passed"):
                    result["checks"]["passed"] = False
            if args.pointer_check and result["checks"].get("passed"):
                target = client.command("WebDriver:ExecuteScript", {"script": "const w=Services.wm.getMostRecentWindow('navigator:browser');const t=w.document.querySelector('[data-native-icons-target]');const r=t.iconImage.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};", "args": [], "newSandbox": False})
                target = target.get("value", target)
                client.command("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "icons-test-mouse", "parameters": {"pointerType": "mouse"}, "actions": [
                    {"type": "pointerMove", "duration": 0, "origin": "viewport", "x": target["x"], "y": target["y"]},
                    {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}, {"type": "pause", "duration": 50},
                    {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]}]})
                time.sleep(0.2)
                pointer = client.command("WebDriver:ExecuteScript", {"script": "const w=Services.wm.getMostRecentWindow('navigator:browser');const t=w.document.querySelector('[data-native-icons-target]');return !!(t?.isConnected&&!t.closing&&w.document.getElementById('zen-icons-sine-root'));", "args": [], "newSandbox": False})
                pointer = pointer.get("value", pointer) if isinstance(pointer, dict) else pointer
                result["checks"]["checks"].append({"name": "native pointer double click opens picker without closing tab", "passed": bool(pointer)})
                if not pointer:
                    result["checks"]["passed"] = False
            result["result"] = "passed" if result["checks"].get("passed") else "failed"
            if args.restart_script and result["result"] == "passed":
                print(json.dumps({"phase": "saving-and-restarting", "run": str(run)}), flush=True)
                try:
                    client.command("Marionette:Quit", {"flags": ["eAttemptQuit"]})
                except RuntimeError:
                    if process.poll() is None:
                        raise
                process.wait(timeout=20)
        except Exception as error:
            result["error"] = str(error)
        finally:
            if connection:
                connection.close()
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)
    if args.restart_script and result["result"] == "passed":
        try:
            result["restart"] = restart_check(run, profile, port, args.restart_script)
            if not result["restart"].get("passed"):
                result["result"] = "failed"
        except Exception as error:
            result["error"] = str(error)
            result["result"] = "failed"
    (run / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result), flush=True)
    return 0 if result["result"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
