package com.lifeos.ai

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val m = c.getSystemService(NotificationManager::class.java)
        m.createNotificationChannel(NotificationChannel("lifeos", "LifeOS reminders", NotificationManager.IMPORTANCE_HIGH))
        val pi = PendingIntent.getActivity(c, 0, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(c, "lifeos").setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("LifeOS AI reminder").setContentText(i.getStringExtra("t") ?: "Reminder")
            .setContentIntent(pi).setAutoCancel(true).build()
        m.notify((System.nanoTime() % 100000).toInt(), n)
    }
}
