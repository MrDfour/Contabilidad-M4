package com.fernandomartinez.contabilidadm4pro;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Actualizador in-app (estilo Mihon) para la app Android.
 *
 * Flujo equivalente al de Mihon:
 *  - descargarApk: baja el APK a la cache interna y emite el progreso por
 *    eventos ("progreso"), terminando con "completado" o "error".
 *  - instalarApk: abre el instalador del sistema sobre el APK via FileProvider.
 *  - puedeInstalar / solicitarPermisoInstalacion: permiso de "instalar apps
 *    desconocidas" requerido a partir de Android 8 (API 26).
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String NOMBRE_APK = "contabilidad-update.apk";
    private static final String MIME_APK = "application/vnd.android.package-archive";

    private volatile boolean descargaCancelada = false;
    private volatile HttpURLConnection conexionActiva = null;

    private File archivoApk() {
        return new File(getContext().getCacheDir(), NOMBRE_APK);
    }

    @PluginMethod
    public void descargarApk(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL del APK");
            return;
        }
        if (conexionActiva != null) {
            call.reject("Ya hay una descarga en curso");
            return;
        }
        descargaCancelada = false;

        Thread hilo = new Thread(() -> {
            try {
                HttpURLConnection conexion = (HttpURLConnection) new URL(url).openConnection();
                conexionActiva = conexion;
                conexion.setConnectTimeout(15000);
                conexion.setReadTimeout(30000);
                conexion.setInstanceFollowRedirects(true);
                int codigo = conexion.getResponseCode();
                if (codigo < 200 || codigo >= 300) {
                    throw new IllegalStateException("HTTP " + codigo);
                }
                long total = conexion.getContentLength();
                File destinoApk = archivoApk();
                try (InputStream entrada = conexion.getInputStream();
                     FileOutputStream salida = new FileOutputStream(destinoApk)) {
                    byte[] buffer = new byte[8192];
                    long leidos = 0;
                    int ultimoPorcentaje = -1;
                    int leidosAhora;
                    while ((leidosAhora = entrada.read(buffer)) != -1) {
                        if (descargaCancelada) {
                            throw new IllegalStateException("Descarga cancelada");
                        }
                        salida.write(buffer, 0, leidosAhora);
                        leidos += leidosAhora;
                        if (total > 0) {
                            int porcentaje = (int) (100 * leidos / total);
                            if (porcentaje > ultimoPorcentaje) {
                                ultimoPorcentaje = porcentaje;
                                JSObject progreso = new JSObject();
                                progreso.put("porcentaje", porcentaje);
                                progreso.put("bytesDescargados", leidos);
                                progreso.put("bytesTotales", total);
                                notifyListeners("progreso", progreso);
                            }
                        }
                    }
                    salida.flush();
                }
                if (descargaCancelada) {
                    throw new IllegalStateException("Descarga cancelada");
                }
                JSObject completado = new JSObject();
                completado.put("ruta", destinoApk.getAbsolutePath());
                completado.put("bytes", destinoApk.length());
                notifyListeners("completado", completado);
            } catch (Exception e) {
                archivoApk().delete();
                JSObject error = new JSObject();
                error.put("mensaje", e.getMessage() != null ? e.getMessage() : e.toString());
                notifyListeners("error", error);
            } finally {
                HttpURLConnection activa = conexionActiva;
                if (activa != null) {
                    activa.disconnect();
                }
                conexionActiva = null;
            }
        });
        hilo.setDaemon(true);
        hilo.start();
        call.resolve();
    }

    @PluginMethod
    public void cancelarDescarga(PluginCall call) {
        descargaCancelada = true;
        HttpURLConnection activa = conexionActiva;
        if (activa != null) {
            activa.disconnect();
        }
        call.resolve();
    }

    @PluginMethod
    public void instalarApk(PluginCall call) {
        File apk = archivoApk();
        if (!apk.exists()) {
            call.reject("No hay APK descargado");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, MIME_APK);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo iniciar la instalacion: " + e.getMessage());
        }
    }

    @PluginMethod
    public void puedeInstalar(PluginCall call) {
        boolean valor = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            valor = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject resultado = new JSObject();
        resultado.put("valor", valor);
        call.resolve(resultado);
    }

    @PluginMethod
    public void solicitarPermisoInstalacion(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                call.reject("No se pudo abrir ajustes: " + e.getMessage());
                return;
            }
        }
        call.resolve();
    }
}
