"""Run with Python Playwright, Chromium and ffprobe installed."""
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get("NOCTURNE_URL", (ROOT / "index.html").as_uri())

with sync_playwright() as playwright, TemporaryDirectory() as tmp:
    chromium = os.environ.get("CHROMIUM_PATH")
    browser = playwright.chromium.launch(executable_path=chromium)
    page = browser.new_page(has_touch=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("requestfailed", lambda request: errors.append(request.url))
    page.goto(URL)
    expect(page.locator("#keyView")).to_have_value("34")
    expect(page.locator("#keybed .key")).to_have_count(34)
    expect(page.locator("#range")).to_contain_text("C3–A5")
    expect(page.locator("#preset option")).to_have_count(96)
    action = page.locator("#lessonAction")
    target = page.locator("#score .current")
    seek = page.locator("#seek")

    drawer = page.locator("#studioDrawer")
    def tools_open(is_open):
        if drawer.evaluate("details => details.open") != is_open:
            drawer.locator(":scope > summary").click()

    tools_open(True)
    page.locator("#bpm").fill("40")
    tools_open(False)
    action.click()
    expect(target).to_have_text("C4")
    # Changing the BPM after playback starts must not affect an active seek.
    tools_open(True)
    page.locator("#bpm").fill("240")
    page.locator("#bpm").press("Tab")
    tools_open(False)
    seek.evaluate("""slider => {
        slider.value = '2.50';
        slider.dispatchEvent(new Event('change', {bubbles: true}));
    }""")
    expect(target).to_have_text("E4")
    assert float(seek.input_value()) >= 2.50
    expect(target).to_have_text("G4", timeout=1300)
    action.click()
    expect(action).to_contain_text("繼續")
    action.click()
    expect(target).to_have_text("G4")

    page.locator("#modeAlong").click()
    # A mode switch should not rewind the song. Restart explicitly for the score check.
    expect(action).to_contain_text("暫停")
    expect(target).to_have_text("G4")
    tools_open(True)
    page.locator("#bpm").fill("100")
    tools_open(False)
    page.locator("#restart").click()
    expect(target).to_have_text("C4")
    page.keyboard.press("q")
    expect(page.locator("#lessonFeedback")).to_contain_text("已彈對 1")

    page.locator("#modePractice").click()
    page.locator("#restart").click()
    page.keyboard.press("w")
    expect(target).to_have_text("C4")
    page.keyboard.press("q")
    expect(target).to_have_text("E4")
    page.locator('#keybed [data-i="16"]').tap()
    expect(target).to_have_text("G4")
    action.click()

    tools_open(True)
    page.locator("#meter").select_option("3")
    metro = page.locator("#metro")
    metro.click()
    expect(page.locator("#beat")).to_have_text("3")
    metro.click()
    expect(page.locator("#beat")).to_have_text("·")

    for track, key in enumerate(("q", "w", "e", "r")):
        page.locator("#tracks input[type=radio]").nth(track).check()
        page.locator("#rec").click()
        tools_open(False)
        if track == 0:
            piano_key = page.locator('#keybed [data-i="12"]')
            piano_key.hover(position={"x": 8, "y": int(piano_key.bounding_box()["height"] * .85)})
            page.mouse.down()
            expect(piano_key).to_have_class("key white active")
            page.mouse.up()
        else:
            page.keyboard.press(key)
        tools_open(True)
        page.locator("#rec").click()
        expect(page.locator("#tracks small").nth(track)).to_have_text("1 音符")
    page.locator("#review").click()
    expect(page.locator("#status")).to_have_text("回放完成。")

    mute = page.locator("#tracks input[type=checkbox]")
    for index in range(4):
        mute.nth(index).check()
    expect(page.locator("#export")).to_be_disabled()
    mute.first.uncheck()
    with page.expect_download() as download:
        page.locator("#export").click()
    output = Path(tmp) / "recording.mp3"
    download.value.save_as(output)
    stream = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_streams",
        "-of", "json", str(output),
    ]))["streams"][0]
    assert (stream["codec_name"], stream["sample_rate"], stream["channels"],
            stream["bit_rate"]) == ("mp3", "44100", 2, "128000"), stream
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "-"], check=True)
    assert not errors, errors
    print("PASS: Demo seek and resume, Play Along, Practice, keyboard/mouse/touch, "
          "96 presets, metronome, four-track recording and 44.1 kHz stereo MP3")
