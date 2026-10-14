package com.lifeos.ai

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.CallLog
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var w: WebView
    private val perms = arrayListOf(
        Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS,
        Manifest.permission.READ_CALL_LOG, Manifest.permission.READ_PHONE_STATE
    ).also { if (Build.VERSION.SDK_INT >= 33) it.add(Manifest.permission.POST_NOTIFICATIONS) }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        w = WebView(this); setContentView(w)
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.addJavascriptInterface(Bridge(), "NativeBridge")
        w.webViewClient = WebViewClient()
        w.loadUrl("file:///android_asset/index.html")
        requestPerms()
    }

    override fun onResume() { super.onResume(); syncCalls() }

    private fun granted() = perms.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    private fun requestPerms() {
        val need = perms.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1) else syncCalls()
    }

    override fun onRequestPermissionsResult(r: Int, p: Array<out String>, g: IntArray) {
        syncCalls(); w.evaluateJavascript("window.permState&&permState()", null)
    }

    /** Picks up missed calls that happened while the app was closed. */
    private fun syncCalls() {
        if (checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) return
        val sp = getSharedPreferences("lifeos", 0)
        val last = sp.getLong("cl", System.currentTimeMillis() - 86400000L)
        contentResolver.query(
            CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE),
            "${CallLog.Calls.TYPE}=? AND ${CallLog.Calls.DATE}>?",
            arrayOf(CallLog.Calls.MISSED_TYPE.toString(), last.toString()), "${CallLog.Calls.DATE} ASC"
        )?.use { c -> while (c.moveToNext()) Store.push(this, "Call", "Missed call from ${c.getString(0)}. Call back soon.") }
        sp.edit().putLong("cl", System.currentTimeMillis()).apply()
    }

    inner class Bridge {
        @JavascriptInterface fun drain(): String = Store.drain(this@MainActivity)
        @JavascriptInterface fun granted(): Boolean = this@MainActivity.granted()
        @JavascriptInterface fun ask() { runOnUiThread { requestPerms() } }
        @JavascriptInterface fun schedule(t: String, at: Long) {
            val am = getSystemService(AlarmManager::class.java)
            val pi = PendingIntent.getBroadcast(
                this@MainActivity, (at / 1000).toInt(),
                Intent(this@MainActivity, AlarmReceiver::class.java).putExtra("t", t),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }
}
