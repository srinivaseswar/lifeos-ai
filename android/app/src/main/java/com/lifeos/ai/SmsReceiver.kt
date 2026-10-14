package com.lifeos.ai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val m = Telephony.Sms.Intents.getMessagesFromIntent(i) ?: return
        val from = m.firstOrNull()?.originatingAddress ?: "Unknown"
        val body = m.joinToString("") { it.messageBody ?: "" }
        Store.push(c, "SMS", "$from: $body")
    }
}
