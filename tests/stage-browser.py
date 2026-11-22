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
      const reading = document.querySelector('#readingLane')?.getBoundingClientRect();
      const visible = selector => !!document.querySelector(selector)?.checkVisibility();
      const drawer = document.querySelector('#studioDrawer');
      return {
        dockBottomGap: Math.round(innerHeight - bed.bottom),
        keyTop: Math.round(bed.top), keysHeight: Math.round(bed.height),
        laneHeight: Math.round(reading?.height || lane?.height || 0),
        toolsClosed: !!drawer && !drawer.open,
        notesVisible: visible('#notes'), tracksVisible: visible('#tracks'),
        keyboardCount: document.querySelectorAll('#keybed .key').length,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        verticalOverflow: document.documentElement.scrollHeight - innerHeight,
      };
    }""")


def check_desktop_bounds(page, width, height, expected):
    """The shell fills the display; the keys are piano-shaped, not flat strips."""
    def rect(sel):
        return page.locator(sel).first.bounding_box()
    bed, dock, white, black = (rect(s) for s in
        ("#keybed", ".piano-dock", "#keybed .white", "#keybed .black"))
    assert abs(dock["x"]) <= 2 and abs(dock["width"] - width) <= 2, dock
    assert abs(bed["x"]-dock["x"]) <= 2 and bed["width"] >= width-2, bed
    assert .42*height <= white["height"] <= .60*height, white
    assert white["height"] >= 2.35*white["width"], white
    assert .43 <= black["width"]/white["width"] <= .77, (white,black)
    assert .47 <= black["height"]/white["height"] <= .75, (white,black)
    expected_width = width / {25:15, 34:20, 61:36, 88:52}[expected]
    assert abs(white["width"]-expected_width) <= 2, white
    assert page.locator("#readingLane").is_visible()
    assert not page.locator("#noteLane").is_visible()


def desktop_exercises(page, width, height, captures):
    # All key events below go through the real keyboard input path.
    g = lambda n: page.locator(f'#readingTrack .read-note[data-group="{n}"]')
    part = lambda n, midi: g(n).locator(f'.read-pitch[data-midi="{midi}"]')
    score=page.locator("#score .current")
    def mid_x(locator):
        r=locator.bounding_box()
        assert r, locator
        return r["x"]+r["width"]/2
    def marker():
        return page.locator("#readingLane").evaluate("""el=>{
          const r=el.getBoundingClientRect(), p=getComputedStyle(el,'::after');
          return {x:r.left+parseFloat(p.left), width:parseFloat(p.width),
                  lane:r.width, has:p.content!=='none'&&p.display!=='none'&&p.visibility!=='hidden'};
        }""")
    def current_at_marker(n):
        m=marker()
        assert m['has'] and 0 < m['width'] <= 5 and abs(m['x']/m['lane']-.30)<.015, m
        assert abs(mid_x(g(n))-m['x']) < 3.5, (g(n).bounding_box(),m)
    qwerty,cde=page.locator("#labelQwerty"),page.locator("#labelCde")
    expect(qwerty).to_be_visible();expect(cde).to_be_visible()
    page.select_option("#song","canon");page.click("#modePractice");page.click("#lessonAction")
    expect(score).to_have_text("F♯4");qwerty.click();expect(qwerty).to_have_attribute("aria-pressed","true")
    expect(page.locator("#keybed")).to_have_attribute("data-label-mode","qwerty")
    expect(part(0,66)).to_have_text("5");expect(page.locator('#keybed [data-midi="66"] .hotkey')).to_have_text("5")
    expect(page.locator('#keybed [data-midi="66"] .hotkey')).to_be_visible()
    current_at_marker(0)
    x1=mid_x(g(1));page.wait_for_timeout(260);assert abs(mid_x(g(1))-x1)<=1
    page.keyboard.press("q");expect(score).to_have_text("F♯4")
    cde.click();expect(cde).to_have_attribute("aria-pressed","true")
    expect(page.locator("#keybed")).to_have_attribute("data-label-mode","cde")
    expect(part(0,66)).to_have_text("F♯4");expect(page.locator('#keybed [data-midi="66"] .note')).to_be_visible()
    expect(page.locator('#keybed [data-midi="66"] .note')).to_have_text("F♯4")
    page.keyboard.press("5");expect(score).to_have_text("E4");current_at_marker(1)

    page.select_option("#song","moon");page.click("#modePractice");page.click("#lessonAction")
    qwerty.click()
    for key in "qetytewrytwe":
        page.keyboard.press(key)
    expect(score).to_have_text("C4+E4");current_at_marker(12)
    expect(part(12,60)).to_have_text("Q");expect(part(12,64)).to_have_text("E")
    if captures and width==1440:
        captures.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(captures / "qwerty-1440x900.png"))
    page.keyboard.press("q");expect(score).to_have_text("C4+E4")
    expect(part(12,60)).to_have_attribute("data-hit","true")
    cde.click();expect(part(12,60)).to_have_text("C4");expect(part(12,64)).to_have_text("E4")
    expect(part(12,60)).to_have_attribute("data-hit","true")
    if captures and width==1440:
        captures.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(captures / "chord-1440x900.png"))
    page.keyboard.press("w");expect(score).to_have_text("C4+E4")
    page.keyboard.press("e");expect(score).to_have_text("D4");current_at_marker(13)
    # Mode switches preserve the group and the lane's transport, with no restart.
    page.click("#modeDemo");expect(score).to_have_text("D4");expect(g(13)).to_have_attribute("data-current","true")
    page.click("#modeAlong");expect(score).to_have_text("D4");expect(g(13)).to_have_attribute("data-current","true")
    # Start from a longer note for robust fractional movement samples at normal tempo.
    page.select_option("#song","canon");page.click("#modeDemo");page.click("#lessonAction")
    expect(score).to_have_text("F♯4")
    pos_before=mid_x(g(1));m_before=marker()
    page.wait_for_timeout(240)
    assert mid_x(g(1))<pos_before-2
    assert abs(marker()["x"]-m_before["x"])<=1
    page.click("#lessonAction");expect(page.locator("#lessonAction")).to_contain_text("繼續")
    pos_pause=mid_x(g(1));page.wait_for_timeout(240)
    assert abs(mid_x(g(1))-pos_pause)<=1
    page.click("#modePractice");expect(score).to_have_text("F♯4")
    expect(page.locator("#lessonAction")).to_contain_text("繼續")
    page.click("#lessonAction");page.keyboard.press("5");expect(score).to_have_text("E4")



def test_view(browser, url, width, height, report_only, layout_only, captures):
    desktop = width >= 1000 and height >= 520
    mobile = not desktop
    ctx = browser.new_context(viewport={"width":width, "height":height},
                              device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda req: errors.append(req.url))
    page.goto(url)
    initial_count=34
    expect(page.locator("#keyView")).to_have_value("34")
    expect(page.locator("#keybed .key")).to_have_count(initial_count)
    expect(page.locator("#keybed .white")).to_have_count(20)
    expect(page.locator("#keybed .black")).to_have_count(14)
    assert page.locator("#keyboardViewport").evaluate("v => v.scrollWidth <= v.clientWidth + 1")
    expect(page.locator("#keybed .key").first).to_have_attribute("data-midi","48")
    expect(page.locator("#keybed .key").last).to_have_attribute("data-midi","81")
    state = inspect(page)
    print(f"{width}x{height} " + json.dumps(state, sort_keys=True), flush=True)
    if report_only:
        ctx.close()
        return
    assert -1 <= state["dockBottomGap"] <= 26, state
    assert state["keysHeight"] >= 58 and state["laneHeight"] >= 48, state
    assert state["toolsClosed"] and not state["notesVisible"] and not state["tracksVisible"], state
    assert state["verticalOverflow"] <= 2 and state["horizontalOverflow"] <= 2, state
    if desktop:
        check_desktop_bounds(page,width,height,initial_count)
    else:
        expect(page.locator("#readingLane")).to_be_hidden()
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
    for count in [61, 88, 25, 34]:
        page.locator("#keyView").select_option(str(count))
        expect(page.locator("#keybed .key")).to_have_count(count)
        assert abs(inspect(page)["dockBottomGap"]) <= 26
    if layout_only:
        expect(page.locator("#readingTrack .read-note" if desktop else "#noteLane .lane-note").first).to_be_visible()
        assert not errors, errors
        ctx.close()
        return
    if desktop:
        desktop_exercises(page,width,height,captures)
        if width>=1920:
            page.select_option("#keyView","88")
            page.set_viewport_size({"width":820,"height":390})
            expect(page.locator("#keybed .key")).to_have_count(88)
            expect(page.locator("#readingLane")).to_be_hidden()
            page.set_viewport_size({"width":width,"height":height})
            expect(page.locator("#keybed .key")).to_have_count(88)
            expect(page.locator("#readingLane")).to_be_visible()
        assert not errors,errors
        ctx.close();return
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
        # The target is visible near the right edge in landscape. Narrowing the
        # viewport must bring it back into sight; don't rely on default scrollLeft.
        page.locator("#keyboardViewport").evaluate("el => { el.scrollLeft = 0; }")
        assert_aligned()
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
        for w,h in [(844,390),(667,375),(390,844),(1280,800),(1440,900),(2560,1080),(3440,1440)]:
            test_view(b,url,w,h,args.report_only,args.layout_only,args.captures)
        b.close()
    print("PASS: all stage viewport checks", flush=True)
