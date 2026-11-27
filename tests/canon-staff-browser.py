"""Check deployed-only staff manifest and real source selection/report controls."""
import sys,os,json,tempfile,threading,http.server,functools
from pathlib import Path
sys.path.insert(0,str(Path(tempfile.gettempdir())/'nocturne-6b0f1afd-smoketools/deps'))
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
with http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT))) as s:
 threading.Thread(target=s.serve_forever,daemon=True).start()
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.path.join(os.environ['ProgramFiles'],'Google/Chrome/Application/chrome.exe'),args=['--mute-audio'])
  p=b.new_page(viewport={'width':1280,'height':900});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  facts=[]
  for song in ['reference','recording','elise']:
   p.goto(f'http://127.0.0.1:{s.server_port}/staff/?source={song}&level=hard&view=rows12')
   p.wait_for_selector('#scoreFour button.current')
   assert p.locator('#scoreFour button').count()==12
   with p.expect_popup() as pop:p.locator('#densityReport').click()
   q=pop.value;q.wait_for_selector('g[data-series]');assert q.locator('g[data-series]').count()==4
   for key in ['easy','normal','hard','extreme']:
    q.locator(f'input[data-toggle-series="{key}"]').uncheck();assert not q.locator(f'g[data-series="{key}"]').is_visible()
   facts.append({'song':song,'notes':p.evaluate('NocturneStaff.snapshot().noteCount'),'report':q.title(),'rows':12})
   q.close()
  # Binding lookup covers the full D arrangement, with no octave folding.
  p.goto(f'http://127.0.0.1:{s.server_port}/?song=canonMutopia&grade=extreme')
  p.wait_for_function('()=>window.NocturnePublishedLayers?.snapshot().keys===1930')
  bindings=p.evaluate('()=>[...new Set(sourceNotes.map(n=>n.midi))].map(m=>[m,bindingFor(m)?.label,keyButtons.has(m)])')
  assert all(x[1] and x[2] for x in bindings),bindings
  assert p.locator('#keyView').input_value()=='61'
  assert not errors,errors
  b.close()
 s.shutdown()
print(json.dumps({'staff':facts,'allDKeys':bindings,'consoleErrors':errors},ensure_ascii=False,indent=1))
