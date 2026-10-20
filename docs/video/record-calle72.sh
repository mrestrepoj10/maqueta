#!/usr/bin/env bash
# Draft demo: Actuación Estratégica Calle 72. Masterplan, Lote 1 at the Metro interchange, survey, results.
. "$(dirname "$0")/lib.sh"
start "https://maqueta-ecru.vercel.app/calle-72/maquette?lite" "$1"
ev "c('metro')" 3; ev "c('metro')" 3
ev "c('Lote 1 · Intercambiador')" 12
ev "c('10 min+')" 3
ev "c('Vivo aquí, soy propietario')" 1.5; ev "c('OK')"
ev "c('No, por el horario')" 1.5; ev "c('OK')"
ev "c('vecinos actuales puedan quedarse')" 1; ev "c('Parques y el Canal')" 1.5; ev "c('OK')"
ev "c('16:00')" 6; num 2; ev "c('OK')"
ev "c('Talleres y comercio')" 1; ev "c('Manzana del cuidado')" 1.5; ev "c('OK')"
type_in "#q-ideas" "Que el intercambiador tenga una plaza cubierta que conecte las dos estaciones."
ev "c('Marcar un punto')" 1.5; tap 640 330; ev "c('OK')"
type_in "#q-preocupaciones" "Mi casa es de dos pisos al lado de una torre de 26. ¿Me van a comprar o me quedo con la sombra?"
ev "c('Enviar')" 4
ev "c('Ver resultados')" 6
ev "c('arrendatario')" 5
ev "c('todos')" 3
stop
