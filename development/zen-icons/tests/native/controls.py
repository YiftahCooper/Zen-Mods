"""Trusted pointer checks of neighbouring BZF controls in fresh headless Zen."""
import time


def run(client):
    checks = []

    def evaluate(body):
        result = client.command("WebDriver:ExecuteScript", {"script":
            "const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document,t=d.querySelector('[data-icons-control-tab]');" + body,
            "args": [], "newSandbox": False})
        return result.get("value", result) if isinstance(result, dict) else result

    def click(selector):
        point = evaluate("const n=t.querySelector(" + repr(selector) + "),r=n.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),width:r.width,height:r.height};")
        if point["width"] <= 0 or point["height"] <= 0:
            raise AssertionError("No native target " + selector)
        client.command("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "icons-controls", "parameters": {"pointerType": "mouse"}, "actions": [
            {"type": "pointerMove", "duration": 0, "origin": "viewport", "x": point["x"], "y": point["y"]},
            {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]}]})
        time.sleep(.1)

    def check(name, body):
        ok = evaluate(body)
        checks.append({"name": name, "passed": ok is True, "detail": ok})
        if ok is not True:
            raise AssertionError(name + ": " + str(ok))

    try:
        click('.better-zen-folders-url-pin')
        check('native URL-pin click unpins URL without opening Icons', "return w.__betterZenFoldersFolderPins.store.read(t).explicit===false&&!d.getElementById('zen-icons-sine-root');")
        check('URL-unpinned tab stays inside folder', "return t.isConnected&&t.group?.isZenFolder===true;")
        click('.better-zen-folders-sticky-underline')
        check('native Sticky click starts grace without opening Icons', "return t.querySelector('.better-zen-folders-sticky-underline').hasAttribute('data-bzf-sticky-pending')&&!d.getElementById('zen-icons-sine-root');")
        click('.better-zen-folders-sticky-underline')
        check('second native Sticky click cancels pending removal', "return !t.querySelector('.better-zen-folders-sticky-underline').hasAttribute('data-bzf-sticky-pending')&&w.__iconsTestSticky.isSticky(t);")
        return {"passed": True, "checks": checks}
    except Exception as error:
        return {"passed": False, "checks": checks, "error": str(error)}
