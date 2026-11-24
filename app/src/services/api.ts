import { ErrorApi } from './errores';
import { obtenerToken, olvidarSesion } from '@/composables/useAuth';
import router from '@/router';

const BASE_URL = import.meta.env.VITE_API_URL;
const TIEMPO_MAXIMO_MS = 10_000;

export interface OpcionesApi {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

/**
 * M1 — Cliente HTTP único de la app.
 * Todas las pantallas llaman a esta función; ninguna usa fetch directamente.
 */
export async function api<T = unknown>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const { method = 'GET', body, params } = opciones;

  // 1. La URL es BASE_URL + ruta. Solo se agregan los parámetros que tienen valor.
  const url = new URL(BASE_URL + ruta);
  if (params) {
    for (const [clave, valor] of Object.entries(params)) {
      if (valor !== undefined && valor !== '') {
        url.searchParams.append(clave, String(valor));
      }
    }
  }

  // 2. Siempre pedimos JSON. 3. Si hay sesión, el token va en el encabezado, nunca en la URL.
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = obtenerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // 4. Un temporizador cancela la petición si tarda más de 10 segundos.
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

  try {
    const respuesta = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controlador.signal,
    });

    // 5. Un 204 no trae cuerpo: devolvemos null.
    if (respuesta.status === 204) return null as T;

    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => null);

      // 6. Un 401 significa que la sesión ya no sirve: se borra y vuelve al login.
      if (respuesta.status === 401 && ruta !== '/login') {
        await olvidarSesion();
        router.replace('/login');
      }

      throw new ErrorApi(respuesta.status, cuerpo);
    }

    // 7. Caso normal: el JSON de la respuesta.
    return (await respuesta.json()) as T;
  } catch (error) {
    // 8. Si no hubo respuesta (red, tiempo agotado o CORS), el estado es 0.
    if (error instanceof ErrorApi) throw error;
    throw new ErrorApi(0, { mensaje: 'No fue posible conectar con la API.' });
  } finally {
    clearTimeout(temporizador);
  }
}
