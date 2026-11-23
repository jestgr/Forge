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
import android.bluetooth.le.ScanFilter;
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
import java.util.Collections;
import java.util.UUID;

/**
 * Bluetooth LE heart rate (standard Heart Rate Service 0x180D): a Garmin watch with "Broadcast Heart Rate" on,
 * or a chest strap. Like EchelonBikePlugin it is protocol-free: raw Heart Rate Measurement bytes go to JS
 * ("data" events), decoding is in app/js/core/hr.js. connect({ address? }) goes straight to a remembered device
 * (no scan) and falls back to scanning if that fails.
 * Events: "state" {state: scanning|connecting|connected|disconnected, name?, error?}, "data" {value: int[]}.
 */
@CapacitorPlugin(
    name = "HeartRate",
    permissions = {
        @Permission(alias = "ble", strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class HeartRatePlugin extends Plugin {

    static final UUID SERVICE = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
    static final UUID MEASUREMENT = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    static final long SCAN_MS = 15000;
    /** A direct connect to a remembered device that hasn't connected by then is dropped (then: scan). */
    static final long DIRECT_MS = 8000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private BluetoothGatt gatt;
    private PluginCall pendingConnect;
    /** True while trying a remembered address: a failure then falls back to scanning instead of failing. */
    private boolean direct = false;

    private String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "ble" : "location";
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "permissionsDone");
            return;
        }
        start(call);
    }

    @PermissionCallback
    private void permissionsDone(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            call.reject("Bluetooth permission denied", "PERMISSION");
            return;
        }
        start(call);
    }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    private void start(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (adapter == null) { call.reject("No Bluetooth on this phone", "UNAVAILABLE"); return; }
        if (!adapter.isEnabled()) { call.reject("Bluetooth is off", "OFF"); return; }
        closeGatt();
        stopScan();
        PluginCall old = pendingConnect;
        if (old != null) old.reject("Cancelled");
        pendingConnect = call;
        String address = call.getString("address");
        if (address != null && BluetoothAdapter.checkBluetoothAddress(address)) {
            direct = true;
            final BluetoothGatt before = connectTo(adapter.getRemoteDevice(address));
            main.postDelayed(() -> {
                if (direct && gatt == before && pendingConnect != null) { closeGatt(); direct = false; startScan(); }
            }, DIRECT_MS);
        } else {
            startScan();
        }
    }

    @SuppressLint("MissingPermission")
    private void startScan() {
        BluetoothAdapter adapter = adapter();
        if (adapter == null || !adapter.isEnabled()) { failConnect("Bluetooth is off"); return; }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) { failConnect("Bluetooth is off"); return; }
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int type, ScanResult result) {
                stopScan();
                connectTo(result.getDevice());
            }

            @Override
            public void onScanFailed(int errorCode) {
                scanCallback = null;
                failConnect("Scan failed (" + errorCode + ")");
            }
        };
        ScanFilter filter = new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build();
        ScanSettings settings = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        final ScanCallback mine = scanCallback;
        scanner.startScan(Collections.singletonList(filter), settings, scanCallback);
        state("scanning", null, null);
        main.postDelayed(() -> {
            if (scanCallback == mine) { stopScan(); failConnect("No heart rate found — turn on Broadcast Heart Rate on the watch"); }
        }, SCAN_MS);
    }

    @SuppressLint("MissingPermission")
    private void stopScan() {
        if (scanner != null && scanCallback != null) {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) { }
        }
        scanCallback = null;
    }

    @SuppressLint("MissingPermission")
    private BluetoothGatt connectTo(BluetoothDevice device) {
        state("connecting", device.getName(), null);
        gatt = device.connectGatt(getContext(), false, callback, BluetoothDevice.TRANSPORT_LE);
        return gatt;
    }

    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                g.close();
                main.post(() -> {
                    if (g != gatt) return; // an old connection we already closed
                    gatt = null;
                    if (direct && pendingConnect != null) { direct = false; startScan(); return; }
                    failConnect("Connection lost");
                    state("disconnected", null, status == BluetoothGatt.GATT_SUCCESS ? null : "status " + status);
                });
            }
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService s = g.getService(SERVICE);
            BluetoothGattCharacteristic m = s == null ? null : s.getCharacteristic(MEASUREMENT);
            if (m == null) { failConnect("This device doesn't send heart rate"); g.disconnect(); return; }
            g.setCharacteristicNotification(m, true);
            BluetoothGattDescriptor d = m.getDescriptor(CCCD);
            if (d == null) { connected(g); return; }
            writeDescriptor(g, d);
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
            connected(g);
        }

        // Android 13+
        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            if (MEASUREMENT.equals(c.getUuid())) data(value);
        }

        // Android 12 and older
        @SuppressWarnings("deprecation")
        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            if (Build.VERSION.SDK_INT < 33 && MEASUREMENT.equals(c.getUuid())) data(c.getValue());
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
            direct = false;
            String name = g.getDevice().getName();
            String address = g.getDevice().getAddress();
            state("connected", name, null);
            if (pendingConnect != null) {
                JSObject ret = new JSObject();
                ret.put("name", name);
                ret.put("address", address);
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
    public void disconnect(PluginCall call) {
        direct = false;
        stopScan();
        failConnect("Cancelled");
        closeGatt();
        state("disconnected", null, null);
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void closeGatt() {
        if (gatt != null) {
            try { gatt.disconnect(); gatt.close(); } catch (Exception ignored) { }
            gatt = null;
        }
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
