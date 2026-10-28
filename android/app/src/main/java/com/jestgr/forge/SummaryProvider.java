package com.jestgr.forge;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Read-only: content://com.jestgr.forge.summary/summary → one row, column "json" = the latest summary
 * (no rows if Forge hasn't written one yet). Readers need the permission
 * com.jestgr.forge.permission.READ_SUMMARY (declared in AndroidManifest.xml); Preflight asks for it.
 */
public class SummaryProvider extends ContentProvider {
    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        MatrixCursor cursor = new MatrixCursor(new String[] { "json" });
        File f = PreflightSharePlugin.summaryFile(getContext());
        if (f.exists()) {
            try {
                cursor.addRow(new Object[] { new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8) });
            } catch (Exception ignored) {
                // An unreadable file reads as "no summary yet".
            }
        }
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        return "application/json";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("read-only");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("read-only");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("read-only");
    }
}
