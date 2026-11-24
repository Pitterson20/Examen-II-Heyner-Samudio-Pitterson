import { onUnmounted, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** M7 — Estado de la red: valor inicial, oyente y liberación al salir de la página. */
export function useConexion() {
  const conectado = ref(true);
  const tipo = ref('unknown');

  // Estado inicial.
  Network.getStatus().then((estado) => {
    conectado.value = estado.connected;
    tipo.value = estado.connectionType;
  });

  // Cambios posteriores. Guardamos el manejador para quitarlo después.
  let oyente: { remove: () => void } | null = null;
  Network.addListener('networkStatusChange', (estado) => {
    conectado.value = estado.connected;
    tipo.value = estado.connectionType;
  }).then((manejador) => {
    oyente = manejador;
  });

  onUnmounted(() => {
    oyente?.remove();
  });

  return { conectado, tipo };
}

/** M7 — Vibración breve solo en la app nativa; en el navegador no hace nada. */
export async function vibrar() {
  if (Capacitor.isNativePlatform()) {
    await Haptics.impact({ style: ImpactStyle.Light });
  }
}
