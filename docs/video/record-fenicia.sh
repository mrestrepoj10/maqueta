#!/usr/bin/env bash
export AGENT_BROWSER_NAMESPACE=maqueta AGENT_BROWSER_SESSION=maqueta
. "$(dirname "$0")/lib.sh"
# Draft demo recording for Fenicia participation (agent-browser). The 3D is slow on this VM,
# so the page is warmed up before recording starts.
set -u
URL="https://maqueta-ecru.vercel.app/fenicia/maquette?lite"
OUT="$1"

ev(){ timeout 60 agent-browser eval "(()=>{$C return $1})()" >/dev/null 2>&1; sleep "${2:-2}"; }
timeout 60 agent-browser set viewport 1280 720 >/dev/null 2>&1
timeout 300 agent-browser open "$URL" >/dev/null 2>&1
sleep 75
timeout 60 agent-browser record start "$OUT" >/dev/null 2>&1
sleep 3
ev "c('hoy')" 3
ev "c('etapa 1')" 4
ev "c('etapa 3')" 4
ev "c('UAU 2')" 6
ev "c('10 min+')" 3
ev "c('Tengo un negocio')" 1.5; ev "c('OK')" 2
ev "c('No, por el horario')" 1.5; ev "c('OK')" 2
ev "c('Comercio vecinal')" 1; ev "c('Plaza de mercado')" 1.5; ev "c('OK')" 2
ev "c('Recuperar el río')" 1; ev "c('Zona verde')" 1.5; ev "c('OK')" 2
ev "c('Ladrillo')" 1; ev "c('Con mucha vegetación')" 1.5; ev "c('OK')" 2
ev "c('16:00')" 4
ev "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='5')?.click()" 2
ev "c('OK')" 2
timeout 60 agent-browser fill "#q-ideas" "Que la plataforma tenga una plaza de mercado abierta al barrio, con locales para los comerciantes de siempre." >/dev/null 2>&1; sleep 2
ev "c('Marcar un punto')" 1.5
timeout 30 agent-browser mouse move 640 330 >/dev/null; timeout 30 agent-browser mouse down >/dev/null; timeout 30 agent-browser mouse up >/dev/null; sleep 3
ev "c('OK')" 2
timeout 60 agent-browser fill "#q-preocupaciones" "Durante la obra mi local queda cerrado. Necesito saber si tendré local en la etapa 1." >/dev/null 2>&1; sleep 2
ev "c('Enviar')" 4
ev "c('Ver resultados')" 5
ev "c('comerciante')" 5
ev "document.querySelector('[aria-label=\"Cerrar resultados\"]')?.parentElement?.parentElement?.scrollBy({top:600,behavior:'smooth'})" 5
timeout 60 agent-browser record stop >/dev/null 2>&1
