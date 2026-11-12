package com.jestgr.forge;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayDeque;
import java.util.UUID;

/**
 * Bluetooth LE link to an Echelon Connect bike (EX-3 / EX-4). Deliberately dumb: it finds the bike, subscribes to
 * its data characteristic and passes raw bytes to JS ("data" events) and writes the bytes JS gives it.
 * The protocol (commands, decoding) lives in app/js/core/bike.js, where it is tested.
 * Events: "state" {state: scanning|connecting|connected|disconnected, name?, error?}, "data" {value: int[]}.
 */
@CapacitorPlugin(
    name = "EchelonBike",
    permissions = {
        @Permission(alias = "ble", strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class EchelonBikePlugin extends Plugin {

    /** Advertised by the bike (seen while scanning). */
    static final UUID ADVERTISED = UUID.fromString("0bf669f0-45f2-11e7-9598-0800200c9a66");
    /** The service that carries the data (after connecting). */
    static final UUID SERVICE = UUID.fromString("0bf669f1-45f2-11e7-9598-0800200c9a66");
    static final UUID WRITE = UUID.fromString("0bf669f2-45f2-11e7-9598-0800200c9a66");
    static final UUID NOTIFY = UUID.fromString("0bf669f4-45f2-11e7-9598-0800200c9a66");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    static final long SCAN_MS = 15000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeChar;
    /** Android GATT does one operation at a time: writes wait here until the previous one is acknowledged. */
    private final ArrayDeque<byte[]> writes = new ArrayDeque<>();
    private boolean writing = false;
    private PluginCall pendingConnect;

    private String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "ble" : "location";
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "permissionsDone");
            return;
        }
        startScan(call);
    }

    @PermissionCallback
    private void permissionsDone(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            call.reject("Bluetooth permission denied", "PERMISSION");
            return;
        }
        startScan(call);
    }

    @SuppressLint("MissingPermission")
    private void startScan(PluginCall call) {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null) { call.reject("No Bluetooth on this phone", "UNAVAILABLE"); return; }
        if (!adapter.isEnabled()) { call.reject("Bluetooth is off", "OFF"); return; }
        closeGatt();
        stopScan();
        pendingConnect = call;
        scanner = adapter.getBluetoothLeScanner();
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int type, ScanResult result) {
                if (!isBike(result)) return;
                stopScan();
                connectTo(result.getDevice());
            }

            @Override
            public void onScanFailed(int errorCode) {
                failConnect("Scan failed (" + errorCode + ")");
            }
        };
        // No filter: some Echelon bikes don't advertise their service UUID, only a name like "ECH-…".
        ScanSettings settings = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        scanner.startScan(null, settings, scanCallback);
        state("scanning", null, null);
        main.postDelayed(() -> { if (scanCallback != null) { stopScan(); failConnect("Bike not found — pedal to wake it and try again"); } }, SCAN_MS);
    }

    @SuppressLint("MissingPermission")
    private static boolean isBike(ScanResult r) {
        ScanRecord rec = r.getScanRecord();
        if (rec != null && rec.getServiceUuids() != null && (rec.getServiceUuids().contains(new ParcelUuid(ADVERTISED)) || rec.getServiceUuids().contains(new ParcelUuid(SERVICE)))) return true;
        String name = rec != null && rec.getDeviceName() != null ? rec.getDeviceName() : r.getDevice().getName();
        return name != null && name.toUpperCase().startsWith("ECH");
    }

    @SuppressLint("MissingPermission")
    private void stopScan() {
        if (scanner != null && scanCallback != null) {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) { }
        }
        scanCallback = null;
    }

    @SuppressLint("MissingPermission")
    private void connectTo(BluetoothDevice device) {
        state("connecting", device.getName(), null);
        gatt = device.connectGatt(getContext(), false, callback, BluetoothDevice.TRANSPORT_LE);
    }

    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                g.close();
                if (g == gatt) gatt = null;
                failConnect("Connection lost");
                state("disconnected", null, status == BluetoothGatt.GATT_SUCCESS ? null : "status " + status);
            }
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService s = g.getService(SERVICE);
            BluetoothGattCharacteristic n = s == null ? null : s.getCharacteristic(NOTIFY);
            writeChar = s == null ? null : s.getCharacteristic(WRITE);
            if (n == null || writeChar == null) { failConnect("This doesn't look like an Echelon bike"); g.disconnect(); return; }
            g.setCharacteristicNotification(n, true);
            BluetoothGattDescriptor d = n.getDescriptor(CCCD);
            if (d == null) { connected(g); return; }
            writeDescriptor(g, d);
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
            connected(g);
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            main.post(() -> { writing = false; pump(); });
        }

        // Android 13+
        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            if (NOTIFY.equals(c.getUuid())) data(value);
        }

        // Android 12 and older
        @SuppressWarnings("deprecation")
        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            if (Build.VERSION.SDK_INT < 33 && NOTIFY.equals(c.getUuid())) data(c.getValue());
        }
    };

    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    private static void writeDescriptor(BluetoothGatt g, BluetoothGattDescriptor d) {
        if (Build.VERSION.SDK_INT >= 33) {
            g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
        } else {
            d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            g.writeDescriptor(d);
        }
    }

    @SuppressLint("MissingPermission")
    private void connected(BluetoothGatt g) {
        main.post(() -> {
            String name = g.getDevice().getName();
            state("connected", name, null);
            if (pendingConnect != null) {
                JSObject ret = new JSObject();
                ret.put("name", name);
                pendingConnect.resolve(ret);
                pendingConnect = null;
            }
        });
    }

    private void failConnect(String msg) {
        main.post(() -> {
            if (pendingConnect != null) { pendingConnect.reject(msg); pendingConnect = null; }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        JSArray arr = call.getArray("value");
        if (gatt == null || writeChar == null || arr == null) { call.reject("Not connected"); return; }
        try {
            byte[] bytes = new byte[arr.length()];
            for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) arr.getInt(i);
            main.post(() -> { writes.add(bytes); pump(); });
            call.resolve();
        } catch (Exception e) {
            call.reject("Bad value", e);
        }
    }

    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    private void pump() {
        if (writing || writes.isEmpty() || gatt == null || writeChar == null) return;
        byte[] next = writes.poll();
        writing = true;
        if (Build.VERSION.SDK_INT >= 33) {
            gatt.writeCharacteristic(writeChar, next, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
        } else {
            writeChar.setValue(next);
            writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            gatt.writeCharacteristic(writeChar);
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        stopScan();
        failConnect("Cancelled");
        closeGatt();
        state("disconnected", null, null);
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void closeGatt() {
        writes.clear();
        writing = false;
        if (gatt != null) {
            try { gatt.disconnect(); gatt.close(); } catch (Exception ignored) { }
            gatt = null;
        }
        writeChar = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopScan();
        closeGatt();
    }

    private void data(byte[] value) {
        JSArray arr = new JSArray();
        for (byte b : value) arr.put(b & 0xff);
        JSObject o = new JSObject();
        o.put("value", arr);
        notifyListeners("data", o);
    }

    private void state(String s, String name, String error) {
        JSObject o = new JSObject();
        o.put("state", s);
        if (name != null) o.put("name", name);
        if (error != null) o.put("error", error);
        notifyListeners("state", o);
    }
}
