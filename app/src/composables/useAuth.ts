import { computed, ref } from 'vue';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Device } from '@capacitor/device';
import { api } from '@/services/api';

export interface Usuario { id: number; nombre: string }

const CLAVE_TOKEN = 'token';
const CLAVE_USUARIO = 'usuario';

// Estado compartido: una sola copia para toda la app.
const token = ref<string | null>(null);
const usuario = ref<Usuario | null>(null);
let tokenCargado = false;

/** Lo usa services/api.ts para armar el encabezado Authorization. */
export const obtenerToken = () => token.value;

/** M2 — Borrar la sesión de la memoria y del almacenamiento cifrado. */
export async function olvidarSesion() {
  token.value = null;
  usuario.value = null;
  await SecureStorage.remove(CLAVE_TOKEN);
  await SecureStorage.remove(CLAVE_USUARIO);
}

export function useAuth() {
  const estaAutenticado = computed(() => token.value !== null);

  /** M2 — Iniciar sesión y guardar el token con SecureStorage (Keystore/Keychain). */
  async function login(email: string, password: string) {
    const info = await Device.getInfo();
    const device_name = `${info.platform} ${info.model}`.slice(0, 60);

    const respuesta = await api<{ token: string; usuario: Usuario }>('/login', {
      method: 'POST',
      body: { email, password, device_name },
    });

    token.value = respuesta.token;
    usuario.value = respuesta.usuario;
    await SecureStorage.set(CLAVE_TOKEN, respuesta.token);
    await SecureStorage.set(CLAVE_USUARIO, respuesta.usuario);
  }

  /** M2 — Restaurar la sesión al abrir la app. Solo se ejecuta una vez. */
  async function cargarToken() {
    if (tokenCargado) return;
    tokenCargado = true;

    const guardado = await SecureStorage.get(CLAVE_TOKEN);
    const guardadoUsuario = await SecureStorage.get(CLAVE_USUARIO);

    if (typeof guardado === 'string') token.value = guardado;
    if (guardadoUsuario && typeof guardadoUsuario === 'object') {
      usuario.value = guardadoUsuario as Usuario;
    }
  }

  /** M2 — Revocar el token en el servidor y borrar la sesión local siempre. */
  async function cerrarSesion() {
    try {
      await api('/logout', { method: 'POST' });
    } finally {
      await olvidarSesion();
    }
  }

  return { usuario, estaAutenticado, login, cargarToken, cerrarSesion };
}
