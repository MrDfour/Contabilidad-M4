package com.fernandomartinez.contabilidadm4pro;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Plugin local del actualizador in-app (no pasa por el registro automatico
        // de plugins de npm, por eso se registra aqui de forma manual).
        registerPlugin(AppUpdaterPlugin.class);
    }
}
