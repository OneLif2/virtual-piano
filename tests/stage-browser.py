"""Check the stage in real Chromium. Pass a URL, or the path to an index.html."""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def inspect(page):
    return page.evaluate("""() => {
      const bed = document.querySelector('#keybed').getBoundingClientRect();
      const lane = document.querySelector('#noteLane')?.getBoundingClientRect();
      const visible = selector => !!document.querySelector(selector)?.checkVisibility();
      const drawer = document.querySelector('#studioDrawer');
      return {
        dockBottomGap: Math.round(innerHeight - bed.bottom),
        keyTop: Math.round(bed.top), keysHeight: Math.round(bed.height),
        laneHeight: Math.round(lane?.height || 0),
        toolsClosed: !!drawer && !drawer.open,
        notesVisible: visible('#notes'), tracksVisible: visible('#tracks'),
        keyboardCount: document.querySelectorAll('#keybed .key').length,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        verticalOverflow: document.documentElement.scrollHeight - innerHeight,
      };
    }""")


def test_view(browser, url, width, height, report_only, layout_only, captures):
    mobile = width <= 940
    ctx = browser.new_context(viewport={"width":width, "height":height},
                              device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda req: errors.append(req.url))
    page.goto(url)
    expect(page.locator("#keybed .key")).to_have_count(25)
    state = inspect(page)
    print(f"{width}x{height} " + json.dumps(state, sort_keys=True), flush=True)
    if report_only:
        ctx.close()
        return
    assert -1 <= state["dockBottomGap"] <= 26, state
    assert state["keysHeight"] >= 58 and state["laneHeight"] >= 48, state
    assert state["toolsClosed"] and not state["notesVisible"] and not state["tracksVisible"], state
    assert state["verticalOverflow"] <= 2 and state["horizontalOverflow"] <= 2, state
    drawer=page.locator("#studioDrawer")
    summary=drawer.locator(":scope > summary")
    summary.focus()
    summary.press("Space")
    expect(drawer).to_have_attribute("open", "")
    assert page.locator("#notes").is_visible() and page.locator("#bpm").is_visible()
    page.locator("#bpm").focus()
    page.keyboard.press("Escape")
    expect(page.locator("#notes")).to_be_hidden()
    expect(summary).to_be_focused()
    for count in [61, 88, 25]:
        page.locator("#keyView").select_option(str(count))
        expect(page.locator("#keybed .key")).to_have_count(count)
        assert abs(inspect(page)["dockBottomGap"]) <= 26
    if layout_only:
        expect(page.locator("#noteLane .lane-note").first).to_be_visible()
        assert not errors, errors
        ctx.close()
        return
    page.select_option("#song", "canon")
    page.click("#modePractice")
    page.click("#lessonAction")
    expect(page.locator("#score .current")).to_have_text("F♯4")
    expect(page.locator("#noteLane .lane-note").first).to_be_visible()
    def assert_aligned():
        page.wait_for_function("""() => {
          const mark = document.querySelector('.lane-note[data-current="true"][data-midi="66"]');
          if (!mark) return false;
          const a = mark.getBoundingClientRect();
          const b = document.querySelector('#keybed [data-midi="66"]').getBoundingClientRect();
          return a.width > 0 && Math.abs((a.left + a.right - b.left - b.right) / 2) < 2.5;
        }""")
    assert_aligned()
    if captures:
        captures.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(captures/f"practice-{width}x{height}.png"),animations="disabled")
    page.select_option("#keyView", "88")
    assert_aligned()
    if (width,height)==(844,390):
        page.set_viewport_size({"width":390,"height":844})
        assert_aligned()
        page.set_viewport_size({"width":width,"height":height})
        assert_aligned()
    page.locator("#keyboardViewport").evaluate("el => { el.scrollLeft += 30; }")
    assert_aligned()
    page.select_option("#keyView","25")
    assert_aligned()
    target=page.locator('#keybed [data-midi="66"]')
    if mobile:
        target.tap()
    else:
        target.click()
    expect(page.locator("#score .current")).to_have_text("E4")
    assert not errors, errors
    ctx.close()


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target")
    parser.add_argument("--report-only",action="store_true")
    parser.add_argument("--layout-only",action="store_true",help="Skip exercises needing Web Audio (e.g. Windows WebKit)")
    parser.add_argument("--captures",type=Path)
    parser.add_argument("--engine",choices=["chromium","webkit"],default="chromium")
    args=parser.parse_args()
    url=args.target if "://" in args.target else Path(args.target).resolve().as_uri()
    with sync_playwright() as p:
        b=(p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
           if args.engine=="chromium" else p.webkit.launch())
        for w,h in [(844,390),(667,375),(390,844),(1280,800)]:
            test_view(b,url,w,h,args.report_only,args.layout_only,args.captures)
        b.close()
