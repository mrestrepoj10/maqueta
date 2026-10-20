#!/usr/bin/env bash
# Draft demo: Chapinero, Kr 7 # 72-41. Compare three options, take the survey, see results.
. "$(dirname "$0")/lib.sh"
start "https://maqueta-ecru.vercel.app/chapinero/maquette?lite" "$1"
ev "c('Opción B · Torre')" 10
ev "c('Opción C · Altura')" 10
ev "c('16:00')" 6
ev "c('Opción A · Bloque')" 8
ev "c('10 min+')" 3
ev "c('Vivo en Porci')" 1.5; ev "c('OK')"
ev "c('Todos los días')" 1.5; ev "c('OK')"
ev "c('B · Torre esbelta, 18')" 12
ev "c('C · Altura media, 9')" 12
ev "c('OK')"
ev "c('16:00')" 4; num 4; ev "c('OK')"
ev "c('Cafés y')" 1; ev "c('Espacio cultural')" 1.5; ev "c('OK')"
ev "c('plazoleta en la esquina')" 1; ev "c('Más árboles')" 1.5; ev "c('OK')"
ev "c('Ladrillo, como')" 1.5; ev "c('OK')"
type_in "#q-ideas" "Una plazoleta en la esquina con árboles, para esperar el bus fuera del andén."
ev "c('Marcar un punto')" 1.5; tap 640 330; ev "c('OK')"
type_in "#q-preocupaciones" "Que el primer piso no sea una fachada cerrada; de noche esta esquina es oscura."
ev "c('Enviar')" 4
ev "c('Ver resultados')" 6
ev "c('vecino')" 5
ev "c('todos')" 3
stop
