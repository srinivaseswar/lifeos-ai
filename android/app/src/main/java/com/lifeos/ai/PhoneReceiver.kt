package com.lifeos.ai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

/** Detects missed calls: ringing followed by idle without the call being answered. */
class PhoneReceiver : BroadcastReceiver() {
    companion object { var ringing = false; var answered = false; var num = "" }

    override fun onReceive(c: Context, i: Intent) {
        if (i.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val st = i.getStringExtra(TelephonyManager.EXTRA_STATE)
        val n = i.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        when (st) {
            TelephonyManager.EXTRA_STATE_RINGING -> { ringing = true; answered = false; if (!n.isNullOrEmpty()) num = n }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> answered = true
            TelephonyManager.EXTRA_STATE_IDLE -> {
                if (ringing && !answered) {
                    Store.push(c, "Call", "Missed call from ${num.ifEmpty { "an unknown number" }}. Call back soon.")
                    c.getSharedPreferences("lifeos", 0).edit().putLong("cl", System.currentTimeMillis()).apply()
                }
                ringing = false; answered = false; num = ""
            }
        }
    }
}
