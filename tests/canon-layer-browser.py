"""Native Chrome smoke for the two public symbolic Canon editions and existing three modes."""
from pathlib import Path
import json,sys,tempfile,os,threading,http.server,functools
sys.path.insert(0,str(Path(tempfile.gettempdir())/'nocturne-6b0f1afd-smoketools/deps'))
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def run():
 result=[]
 with http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT))) as server:
  threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
  with sync_playwright() as pw:
   b=pw.chromium.launch(executable_path=os.path.join(os.environ['ProgramFiles'],'Google/Chrome/Application/chrome.exe'),args=['--mute-audio'])
   p=b.new_page(viewport={'width':1280,'height':900});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
   p.add_init_script('window.actualStarts=[];const old=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){actualStarts.push({t:args[0],rate:this.playbackRate.value});return old.apply(this,args)}')
   for song in ['canonMutopia','canonFull']:
    for grade in ['easy','normal','hard','extreme']:
     p.goto(base+'/?song='+song+'&grade='+grade)
     p.wait_for_function('()=>window.NocturnePublishedLayers?.snapshot().grade===document.querySelector("#scoreGrade").value',timeout=15000)
     before=p.evaluate('NocturnePublishedLayers.snapshot()');assert before['song']==song and before['grade']==grade,before
     for mode,id in [('Demo','modeDemo'),('Along','modeAlong'),('Practice','modePractice')]:
      p.locator('#'+id).click();p.locator('#lessonAction').click()
      p.wait_for_function('()=>NocturnePublishedLayers.snapshot().playing',timeout=20000)
      p.wait_for_timeout(250)
      live=p.evaluate('NocturnePublishedLayers.snapshot()');assert live['mode']==mode,live
      if mode!='Demo':assert all(e['track']==1 for e in live['live']),live
      if grade=='extreme' and mode!='Demo':assert not live['live'],live
      if song=='canonMutopia' and mode=='Demo':assert live['live'],live
      result.append(live)
      p.locator('#lessonAction').click();assert not p.evaluate('NocturnePublishedLayers.snapshot().playing')
     assert not errors,errors
   b.close()
  server.shutdown()
 return result
if __name__=='__main__':
 out=run();print(json.dumps(out,ensure_ascii=False,indent=1))
