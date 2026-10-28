package com.jestgr.forge;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Keeps the latest Preflight summary (app/js/core/share.js) in app storage, where {@link SummaryProvider}
 * serves it to Preflight. Called from app/js/platform/preflight.js.
 */
@CapacitorPlugin(name = "PreflightShare")
public class PreflightSharePlugin extends Plugin {

    static File summaryFile(android.content.Context context) {
        return new File(context.getFilesDir(), "preflight-summary.json");
    }

    @PluginMethod
    public void publish(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json missing");
            return;
        }
        File target = summaryFile(getContext());
        File tmp = new File(target.getPath() + ".tmp");
        // Write then rename, so Preflight never reads half a file.
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            call.reject("write failed", e);
            return;
        }
        if (!tmp.renameTo(target)) {
            call.reject("rename failed");
            return;
        }
        call.resolve();
    }
}
