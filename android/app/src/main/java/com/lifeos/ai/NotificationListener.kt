package com.lifeos.ai

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Intercepts incoming WhatsApp and messaging notifications with user permission.
 * Extracts event/scheduling details and queues them for the LifeOS Smart Scheduler.
 */
class NotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkg = sbn.packageName ?: return
        val extras = sbn.notification?.extras ?: return

        // Intercept WhatsApp and WhatsApp Business notifications
        if (pkg == "com.whatsapp" || pkg == "com.whatsapp.w4b") {
            val title = extras.getString(Notification.EXTRA_TITLE) ?: "WhatsApp"
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

            if (text.isNotBlank() && !text.contains("messages from") && !text.contains("new messages")) {
                Store.push(applicationContext, "WhatsApp", "$title: $text")
            }
        }
    }
}
