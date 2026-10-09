# plugin-countdown

**Cuenta atrás** para [FlickerTalk](https://flickertalk.com). Los días que importan y cuántos
faltan: cumpleaños, viajes, aniversarios. Guardados solo en el teléfono.

- Cada fecha tiene un nombre, un día y, si se quiere, **se repite cada año** (la lista dice los
  años que cumple). La lista pone primero lo que viene, lo más cercano arriba; después lo que ya
  pasó.
- **Aviso solo para mí**: el mismo día, el día antes o una semana antes, a las nueve de la mañana.
  Las fechas anuales vuelven a avisar al año siguiente. El contacto nunca se entera: no toca el
  protocolo ni el servidor.
- Por defecto la notificación dice solo que hay un aviso; el nombre del día se enseña únicamente
  si el usuario lo activa en los ajustes del plugin.
- **Ponerlo en el chat**: abierto en una conversación, deja en el redactor una línea como
  «Cumpleaños de Ana · Faltan 12 días · 30 años». El usuario es quien pulsa enviar.
- **Importar un calendario**: «Abrir con» → Cuenta atrás sobre un archivo `.ics` del chat añade sus
  eventos (nombre, día, y anual si su regla dice `FREQ=YEARLY`).

Todo ocurre en el teléfono: el plugin no tiene red, no ve la conversación ni la identidad del
contacto.

## Qué usa del núcleo

| Capacidad    | Para qué                                                               |
| ------------ | ---------------------------------------------------------------------- |
| `ft.records` | una fecha por registro (`event/<id>`, JSON), dentro de la cuota        |
| `ft.remind`  | poner, mover y quitar el aviso (permiso `remind`)                      |
| `ft.store`   | el ajuste «nombre en la notificación»                                  |
| `ft.say`     | la línea en el redactor (permiso `send: propose`)                      |
| `onOpen`     | `lang`; `reminder` cuando se toca el aviso; `file` con un `.ics`; `chat` |

Necesita el núcleo **1.1.0** (`minCoreVersion`). El contrato está en
[plugin-sdk](https://github.com/FlickerTalk/plugin-sdk).

Desde la 1.0.2 la ventana va en los envoltorios de Ionic que la app presta al marco (barra en
`ion-header`, cuerpo en `ion-content`, botones de Ionic), así que se ve como el resto de
FlickerTalk; pide la app 1.6.0 (`minCoreVersion`) y el paquete no lleva Ionic. `@ionic/core` es
solo `devDependency`, para que los tests pinten lo mismo que el teléfono.

## Desarrollo

```sh
npm install
npm test
```

El paquete `.ftplugin` lo firma el catálogo de FlickerTalk; no se construye aquí.

## Licencia

MIT.
