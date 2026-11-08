"""Trusted WebDriver key actions in the disposable profile made by probe.py."""
import time


def run(client):
    checks = []

    def evaluate(script):
        result = client.command("WebDriver:ExecuteScript", {
            "script": "const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;" + script,
            "args": [], "newSandbox": False})
        return result.get("value", result) if isinstance(result, dict) else result

    def key(value):
        client.command("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "icons-keyboard", "actions": [
            {"type": "keyDown", "value": value}, {"type": "keyUp", "value": value}]}]})
        time.sleep(.12)

    def check(name, expression):
        detail = evaluate(expression)
        ok = detail is True
        checks.append({"name": name, "passed": ok, "detail": detail})
        if not ok:
            raise AssertionError(name + ": " + str(detail))

    try:
        # Native focus and key actions; no synthetic DOM keyboard events.
        check("picker starts with keyboard focus in search", "return d.activeElement?.matches('.zen-icons-search');")
        key("\ue004")  # Tab
        check("Tab reaches Filter button", "return d.activeElement?.matches('.zen-icons-filter-button');")
        key("\ue007")  # Enter
        check("Enter opens Filter popup", "return d.getElementById('zen-icons-sine-filter-panel')?.state==='open';")
        key("\ue004")
        check("Tab enters Filter popup controls", "return !!d.activeElement?.closest('#zen-icons-sine-filter-panel');")
        check("keyboard focus remains visible in Filter popup", "const n=d.activeElement,r=n.getBoundingClientRect(),p=d.getElementById('zen-icons-sine-filter-panel').getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=p.top&&r.bottom<=p.bottom;")
        before = evaluate("return d.activeElement.checked;")
        key(" ")
        check("Space toggles focused provider once", "return d.activeElement.checked===" + ("false" if before else "true") + ";")
        key(" ")
        resting = evaluate("const s=w.getComputedStyle(d.querySelector('.zen-icons-category-link'));return {background:s.backgroundColor,outline:s.outlineStyle+':'+s.outlineWidth+':'+s.outlineColor};")
        for _ in range(20):
            if evaluate("return d.activeElement?.matches('.zen-icons-category-link');"):
                break
            key("\ue004")
        check("category navigation reachable by native Tab", "return d.activeElement?.matches('.zen-icons-category-link:focus-visible');")
        focused = evaluate("const s=w.getComputedStyle(d.activeElement);return {background:s.backgroundColor,outline:s.outlineStyle+':'+s.outlineWidth+':'+s.outlineColor};")
        checks.append({"name": "keyboard category focus has a distinct painted cue", "passed": focused != resting, "detail": {"resting": resting, "focused": focused}})
        if focused == resting:
            raise AssertionError("Category focus has no distinct painted cue")
        key("\ue00c")  # Escape
        check("Escape dismisses Filter without dismissing picker", "return d.getElementById('zen-icons-sine-filter-panel')?.state==='closed'&&d.getElementById('PanelUI-zen-emojis-picker').state==='open';")
        check("Filter dismissal returns keyboard focus to Filter button", "return d.activeElement?.matches('.zen-icons-filter-button');")
        # Search into one known icon, then use native Tab/Enter to choose it.
        evaluate("d.querySelector('.zen-icons-search').focus();return true;")
        for letter in "dog":
            key(letter)
        check("keyboard typing searches tags", "return !!d.querySelector('[data-icon-id=\"lucide:dog\"]');")
        for _ in range(30):
            if evaluate("return d.activeElement?.dataset?.iconId==='lucide:dog';"):
                break
            key("\ue004")
        check("dog result reachable using Tab", "return d.activeElement?.dataset?.iconId==='lucide:dog';")
        key("\ue007")
        check("Enter selects focused icon through native callback", "return String(w.__iconsKeyboardChoice).includes('/dog.svg');")
        key("\ue00c")
        check("Escape closes picker and removes view", "return d.getElementById('PanelUI-zen-emojis-picker').state==='closed'&&!d.getElementById('zen-icons-sine-root');")
        return {"passed": True, "checks": checks}
    except Exception as error:
        return {"passed": False, "checks": checks, "error": str(error)}
