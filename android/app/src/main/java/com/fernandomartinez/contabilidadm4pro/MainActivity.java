package com.fernandomartinez.contabilidadm4pro;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * Plugin local del actualizador in-app: no viene de npm, por eso hay que
     * registrarlo a mano. OJO: se hace en `load()` ANTES de super.load(); si se
     * pone en onCreate despues de super.onCreate(), el Bridge ya fue creado
     * (create() copia la lista de plugins del builder) y el registro es un
     * no-op silencioso -> "plugin not implemented" desde JS.
     */
    @Override
    protected void load() {
        registerPlugin(AppUpdaterPlugin.class);
        super.load();
    }
}
