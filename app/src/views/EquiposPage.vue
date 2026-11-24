<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Equipos</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/tabs/equipos/nuevo" aria-label="Nuevo equipo">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="q" :debounce="400" placeholder="Buscar por código o nombre" @ion-input="buscar" />
      </ion-toolbar>
      <!-- YA IMPLEMENTADO: depende de useConexion() [M7] -->
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: los datos pueden estar desactualizados</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- M4 — Jalar hacia abajo vuelve a pedir la página 1. -->
      <ion-refresher slot="fixed" @ionRefresh="refrescar">
        <ion-refresher-content pulling-text="Jalar para actualizar" refreshing-text="Actualizando..." />
      </ion-refresher>

      <!-- M4 — Lista con nombre, código · categoría, badge de estado y enlace a editar. -->
      <ion-list v-if="equipos.length > 0">
        <!-- M6 — Al deslizar el ítem aparece la opción Eliminar. -->
        <ion-item-sliding v-for="equipo in equipos" :key="equipo.id">
          <ion-item :router-link="`/tabs/equipos/${equipo.id}/editar`" detail>
            <ion-label>
              <h3>{{ equipo.nombre }}</h3>
              <p>{{ equipo.codigo }} · {{ equipo.categoria.nombre }}</p>
            </ion-label>
            <ion-badge slot="end" :color="colorEstado[equipo.estado]">{{ equipo.estado }}</ion-badge>
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="confirmarEliminacion(equipo, $event)">
              <ion-icon slot="icon-only" :icon="trashOutline" />
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <!-- M4 — Esqueleto solo en la primera carga. -->
      <div v-if="cargando && equipos.length === 0" class="ion-padding">
        <ion-skeleton-text v-for="n in 3" :key="n" animated style="height: 56px; margin-bottom: 8px" />
      </div>

      <!-- M4 — Error con botón para reintentar. -->
      <div v-else-if="error" class="ion-padding">
        <p>{{ error }}</p>
        <ion-button @click="cargar(true)">Reintentar</ion-button>
      </div>

      <!-- M4 — Estado vacío. -->
      <div v-else-if="equipos.length === 0" class="estado-vacio">
        <ion-icon :icon="searchOutline" />
        <p>No hay equipos para mostrar.</p>
      </div>

      <!-- M4 — Pide la página siguiente mientras no estemos en la última. -->
      <ion-infinite-scroll v-if="hayMas" @ionInfinite="cargarMas">
        <ion-infinite-scroll-content loading-text="Cargando más equipos..." />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSearchbar, IonContent,
  IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonSkeletonText, IonBadge,
  IonItemSliding, IonItemOptions, IonItemOption, IonInfiniteScroll, IonInfiniteScrollContent,
  alertController, onIonViewWillEnter,
} from '@ionic/vue';
import type { InfiniteScrollCustomEvent, RefresherCustomEvent } from '@ionic/vue';
import { add, cloudOfflineOutline, searchOutline, trashOutline } from 'ionicons/icons';
import { eliminar, listar, type Equipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

void [cloudOfflineOutline];

const colorEstado: Record<Estado, string> = {
  disponible: 'success',
  prestado: 'warning',
  mantenimiento: 'medium',
};

const { conectado } = useConexion();

const equipos = ref<Equipo[]>([]);
const pagina = ref(0);
const ultimaPagina = ref(1);
const q = ref('');
const cargando = ref(false);
const error = ref('');
const hayMas = computed(() => pagina.value < ultimaPagina.value);

/** M4 — Carga una página. Con reiniciar=true reemplaza la lista; si no, la agrega. */
async function cargar(reiniciar = false) {
  cargando.value = true;
  error.value = '';
  const paginaActual = reiniciar ? 1 : pagina.value + 1;

  try {
    const respuesta = await listar(paginaActual, q.value);
    pagina.value = respuesta.meta.current_page;
    ultimaPagina.value = respuesta.meta.last_page;

    if (reiniciar) equipos.value = respuesta.data;
    else equipos.value.push(...respuesta.data);
  } catch (e) {
    error.value = 'No fue posible cargar los equipos.';
  } finally {
    cargando.value = false;
  }
}

// M4 — Al volver a la pestaña (incluso desde el formulario) se recarga todo.
onIonViewWillEnter(() => cargar(true));

const buscar = () => cargar(true);

/** M4 — Refresher: recarga desde la página 1 y cierra el indicador. */
async function refrescar(evento: RefresherCustomEvent) {
  await cargar(true);
  evento.target.complete();
}

/** M4 — Infinite scroll: trae la página siguiente y cierra el indicador. */
async function cargarMas(evento: InfiniteScrollCustomEvent) {
  await cargar(false);
  evento.target.complete();
}

/** M6 — Pregunta confirmación y elimina solo si el botón fue "destructive". */
async function confirmarEliminacion(equipo: Equipo, evento: Event) {
  // Primero cerramos el ítem deslizado.
  const sliding = (evento.target as HTMLElement).closest('ion-item-sliding') as any;
  sliding?.close();

  const alerta = await alertController.create({
    header: 'Eliminar equipo',
    message: `¿Eliminar ${equipo.nombre}?`,
    buttons: [
      { text: 'Cancelar', role: 'cancel' },
      { text: 'Eliminar', role: 'destructive' },
    ],
  });
  await alerta.present();
  const { role } = await alerta.onDidDismiss();
  if (role !== 'destructive') return;

  try {
    await eliminar(equipo.id);
    // 204: quitamos el equipo de la lista sin volver a cargarla.
    equipos.value = equipos.value.filter((item) => item.id !== equipo.id);
    await vibrar();
    await mostrarToast('Equipo eliminado.', 'success');
  } catch (error) {
    if (error instanceof ErrorApi && error.status === 409) {
      // Regla R1: está prestado, el mensaje viene de la API y el equipo se queda.
      await mostrarToast(error.cuerpo?.mensaje ?? 'No se puede eliminar un equipo prestado.', 'warning');
    } else if (error instanceof ErrorApi && error.status === 404) {
      equipos.value = equipos.value.filter((item) => item.id !== equipo.id);
      await mostrarToast('El equipo ya no existe.', 'warning');
    } else {
      await mostrarToast('No fue posible eliminar el equipo.', 'danger');
    }
  }
}
</script>
