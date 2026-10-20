# Shared helpers for the draft demo recordings (agent-browser, isolated namespace).
export AGENT_BROWSER_NAMESPACE=maqueta AGENT_BROWSER_SESSION=maqueta
C='const c=(t)=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().includes(t));if(b)b.click();return b?1:0};'
ev(){ timeout 120 agent-browser eval "(()=>{$C return $1})()" >/dev/null 2>&1; sleep "${2:-2}"; }
num(){ ev "[...document.querySelectorAll('aside button')].find(b=>b.textContent.trim()==='$1')?.click()" "${2:-2}"; }
type_in(){ timeout 120 agent-browser fill "$1" "$2" >/dev/null 2>&1; sleep 2; }
tap(){ timeout 30 agent-browser mouse move "$1" "$2" >/dev/null; timeout 30 agent-browser mouse down >/dev/null; timeout 30 agent-browser mouse up >/dev/null; sleep 3; }
start(){ timeout 30 agent-browser set viewport 1280 720 >/dev/null 2>&1; timeout 300 agent-browser open "$1" >/dev/null 2>&1; sleep 70; timeout 60 agent-browser record start "$2" >/dev/null 2>&1; sleep 3; }
stop(){ timeout 120 agent-browser record stop >/dev/null 2>&1; }
