"""Make the 30-second demo video from the real app.

It drives the app in a headless browser, records the screen (Playwright) and the
app's own synthesized sound (a MediaRecorder tapped onto the audio engine), burns
in English captions, cuts out the time spent waiting for NASA, and joins the
scenes with ffmpeg. Nothing is AI-generated and no NASA logo appears.

Usage: python make_demo_video.py <app url> <output .mp4> [work dir]
Needs playwright (with Chromium) and imageio-ffmpeg.
"""
import asyncio
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], Path(sys.argv[2])
WORK = Path(sys.argv[3]) if len(sys.argv) > 3 else OUT.parent / "demo_work"
WORK.mkdir(parents=True, exist_ok=True)
END_URL = "the-blue-record.vercel.app"
FF = imageio_ffmpeg.get_ffmpeg_exe()
ARGS = ["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]

INIT = """
(() => {
  const css = document.createElement('style');
  css.textContent = `
    #__cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;pointer-events:none;
      max-width:86vw;text-align:center;font:700 34px/1.2 Inter,system-ui,sans-serif;color:#fff;letter-spacing:-0.01em;
      background:rgba(7,10,28,.86);padding:12px 26px;border-radius:16px;border:1px solid rgba(200,208,231,.25);
      box-shadow:0 12px 40px rgba(0,0,0,.5);transition:opacity .2s}
    #__cap small{display:block;font:500 22px/1.3 Inter,system-ui,sans-serif;color:#c8d0e7;margin-top:6px}
    #__dim{position:fixed;inset:0;z-index:99998;background:#05070f;display:none;align-items:center;justify-content:center;
      font:700 74px/1.1 Inter,system-ui,sans-serif;color:#f4f0ea;letter-spacing:-0.03em;text-align:center}
    #__dim small{display:block;font:500 28px/1.4 Inter,system-ui,sans-serif;color:#c8d0e7;margin-top:18px;letter-spacing:0}
    #__cur{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;z-index:100000;pointer-events:none;
      background:rgba(255,255,255,.92);border:3px solid #f0a271;box-shadow:0 0 0 2px rgba(0,0,0,.45);transition:transform .12s}
  `;
  document.addEventListener('DOMContentLoaded', () => {
    document.head.appendChild(css);
    const cap = Object.assign(document.createElement('div'), { id: '__cap' }); cap.style.opacity = 0;
    const dim = Object.assign(document.createElement('div'), { id: '__dim' });
    const cur = Object.assign(document.createElement('div'), { id: '__cur' }); cur.style.display = 'none';
    document.body.append(cap, dim, cur);
    document.addEventListener('mousemove', (e) => { cur.style.display = 'block'; cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; });
    document.addEventListener('mousedown', () => { cur.style.transform = 'scale(.7)'; });
    document.addEventListener('mouseup', () => { cur.style.transform = 'scale(1)'; });
    window.__cap = (t, sub) => { cap.style.opacity = t ? 1 : 0; cap.innerHTML = t ? t + (sub ? `<small>${sub}</small>` : '') : ''; };
    window.__dim = (t, sub) => { dim.style.display = t ? 'flex' : 'none'; dim.innerHTML = t ? `<div>${t}${sub ? `<small>${sub}</small>` : ''}</div>` : ''; };
  });
})();
"""

REC_AUDIO = """async () => {
  const { engine } = window.blueRecord;
  await engine.start();
  const dest = engine.ctx.createMediaStreamDestination();
  engine.master.connect(dest);
  window.__chunks = [];
  const rec = window.__rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
  rec.ondataavailable = (e) => window.__chunks.push(e.data);
  rec.start(250);
}"""

STOP_AUDIO = """async () => {
  const rec = window.__rec;
  await new Promise((res) => { rec.onstop = res; rec.stop(); });
  const blob = new Blob(window.__chunks, { type: 'audio/webm' });
  return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); });
}"""


async def main():
    keep = []                                  # (start, end) in take time, seconds
    audio_from = {}                            # scene index -> where in the take to borrow its sound from
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 1280, "height": 720}, record_video_dir=str(WORK), record_video_size={"width": 1280, "height": 720})
        await ctx.add_init_script(INIT)
        t0 = time.perf_counter()
        pg = await ctx.new_page()
        now = lambda: time.perf_counter() - t0
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        await pg.goto(URL)
        await pg.wait_for_function("document.getElementById('globeLoad').hidden === true", timeout=60000)
        await pg.evaluate("window.blueApp.x.voice = false; document.getElementById('cVoice').checked = false")
        await pg.evaluate(REC_AUDIO)
        t_audio = now()
        await pg.wait_for_timeout(500)

        # A. Close your eyes.
        await pg.evaluate("window.__dim('Close your eyes.', 'Listen.')")
        a0 = now(); await pg.wait_for_timeout(2400); keep.append((a0, now()))
        await pg.evaluate("window.__dim(null)")

        # B. Pick a country on the globe.
        b0 = now()
        await pg.evaluate("window.__cap('Pick any country on Earth.')")
        await pg.evaluate("(() => { const g = window.blueApp.x.globe; g.idle = false; g.vLon = 0; g.flyTo(31, 10, 2.9, 900); })()")
        await pg.wait_for_timeout(900)
        pt = await pg.evaluate("""() => { const g = window.blueApp.x.globe; const r = g.cv.getBoundingClientRect();
          for (let y = r.top; y < r.bottom; y += 3) for (let x = r.left; x < r.right; x += 3) { const q = g.pick(x, y);
            if (q && Math.abs(q.lat - 34) < 0.5 && Math.abs(q.lon - 9.5) < 0.5) return [x, y]; } return null }""")
        await pg.mouse.move(pt[0] - 160, pt[1] - 90); await pg.mouse.move(pt[0], pt[1], steps=14)
        await pg.wait_for_timeout(250)
        await pg.mouse.click(pt[0], pt[1])
        await pg.wait_for_timeout(1500)
        keep.append((b0, now()))

        async def pick_country(name):
            await pg.evaluate("window.blueApp.x.stage === 'play' && document.getElementById('backGlobe').click()")
            await pg.evaluate("document.getElementById('pickPanel').hidden && document.getElementById('changeCountry').click()")
            await pg.wait_for_timeout(400)
            await pg.fill("#countrySearch", name)
            await pg.keyboard.press("Enter")
            await pg.wait_for_timeout(900)

        async def scene(category, caption, sub, secs, row=None, loadcut=0.7, first=False):
            """Click a category card, cut out the wait for NASA, then play it for `secs` seconds."""
            card = pg.locator(f".cat >> nth={category}")
            box = await card.bounding_box()
            await pg.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5, steps=12)
            await pg.evaluate("window.__cap(%s, %s)" % (json.dumps(caption), json.dumps(sub)))
            t0 = now()
            await pg.mouse.down(); await pg.mouse.up()
            await pg.wait_for_timeout(int(loadcut * 1000)); keep.append((t0, now()))          # "Asking NASA..." for a moment
            await pg.wait_for_function("document.getElementById('mapLoad').hidden === true", timeout=120000)
            await pg.evaluate("document.getElementById('cSpeed').value = '5.5'; document.getElementById('cSpeed').dispatchEvent(new Event('change'))")
            if row is not None:
                await pg.evaluate("(() => { const r = document.getElementById('cRow'); r.value = %d; r.dispatchEvent(new Event('input')); })()" % row)
            await pg.evaluate("window.scrollTo(0, 120)")
            t1 = now()
            if first:
                audio_from[0] = t1 + 1.2            # the opening scene borrows a few seconds of the real tone
            await pg.keyboard.press("Space")
            await pg.wait_for_timeout(int(secs * 1000)); keep.append((t1, now()))
            assert await pg.evaluate("window.blueApp.x.playing"), "playback did not start"
            await pg.keyboard.press("Space")
            await pg.evaluate("window.scrollTo(0, 0)")
            await pg.locator("#backCat").click()
            await pg.wait_for_timeout(450)

        # C. Temperature: a warm tone.
        await scene(0, "Heat is a warm tone.", "The data comes live from NASA.", 3.0, first=True)
        # D. Height of the land: a deep rumble.
        await scene(2, "Mountains rumble.", None, 2.6)
        # E. Rain: a patter. Use whichever country has the most rain right now.
        rainy = await pg.evaluate("""async () => {
          const P = await import('./js/placedata.js'); const C = await import('./js/categories.js');
          const cs = P.countries(); let best = null;
          for (const name of ['Philippines', 'Indonesia', 'Brazil', 'Colombia', 'Vietnam']) {
            const id = cs.findIndex((c) => c && c.n === name); if (id < 1) continue;
            const d = await C.loadCountry(cs[id], id, C.categoryById('rain'), null, { latestOnly: true });
            const f = d.frames[0].values; let n = 0, tot = 0;
            for (let k = 0; k < f.length; k += 7) { if (d.mask[k] === 2) { tot++; if (!Number.isNaN(f[k])) n++; } }
            const share = tot ? n / tot : 0;
            if (!best || share > best.share) best = { name, share };
          }
          return best; }""")
        print("rainiest country right now:", rainy)
        await pick_country(rainy["name"])
        await scene(1, "Rain patters.", None, 2.8, row=50)
        # F. Back to Tunisia: greenness, and the Mars chime.
        await pick_country("Tunisia")
        await pg.evaluate("window.__bl = 0; const e = window.blueRecord.engine; const o = e.bling.bind(e); e.bling = (t) => { window.__bl++; return o(t); }")
        await scene(3, "Bare ground, like Mars?", "Listen for the chime.", 4.0, row=61)
        blings = await pg.evaluate("window.__bl")
        # G. The whole planet on a record.
        g0 = now()
        await pg.evaluate("window.__cap('Or hear the whole planet on a record.')")
        await pg.evaluate("document.getElementById('tabRecord').click()")
        await pg.wait_for_function("document.getElementById('loading').hidden === true", timeout=60000)
        await pg.evaluate("window.scrollTo(0, 0)")
        await pg.wait_for_timeout(300)
        g1 = now()
        await pg.keyboard.press("Space")
        await pg.wait_for_timeout(2600); keep.append((g1, now()))
        await pg.keyboard.press("Space")

        # H. End card.
        f0 = now()
        await pg.evaluate(f"window.__dim('So everyone can hear their country.', 'The Blue Record · {END_URL}')")
        await pg.wait_for_timeout(2200); keep.append((f0, now()))

        audio_b64 = await pg.evaluate(STOP_AUDIO)
        await ctx.close()
        video_path = Path(await pg.video.path())
        await b.close()

    (WORK / "audio.webm").write_bytes(base64.b64decode(audio_b64))
    total = sum(e - s for s, e in keep)
    assert total <= 29.8, f"the cut is {total:.1f}s, over the 30 second limit"
    print(f"chimes heard in the Mars scene: {blings} | errors: {errs[:3]} | kept {total:.1f}s of {now():.1f}s")

    # Cut the waiting out of the take and join the scenes. Audio is placed on the same
    # timeline (it started t_audio seconds into the take) before the same cuts are made.
    parts_v, parts_a = [], []
    for i, (s, e) in enumerate(keep):
        parts_v.append(f"[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS,fps=30[v{i}]")
        a0 = audio_from.get(i, s)
        parts_a.append(f"[1:a]adelay={int(t_audio * 1000)}:all=1,atrim={a0:.3f}:{a0 + (e - s):.3f},asetpts=PTS-STARTPTS,aresample=44100[a{i}]")
    n = len(keep)
    graph = ";".join(parts_v + parts_a) + ";" + "".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]"
    cmd = [FF, "-y", "-hide_banner", "-loglevel", "error", "-i", str(video_path), "-i", str(WORK / "audio.webm"),
           "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", "29.8", str(OUT)]
    subprocess.run(cmd, check=True)
    print("wrote", OUT, f"{OUT.stat().st_size / 1e6:.1f} MB")


asyncio.run(main())
