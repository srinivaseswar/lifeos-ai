package com.lifeos.ai

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Queue of captured SMS/call items waiting for the web UI to pick them up. */
object Store {
    private fun p(c: Context) = c.getSharedPreferences("lifeos", 0)

    @Synchronized fun push(c: Context, src: String, text: String) {
        val a = JSONArray(p(c).getString("q", "[]"))
        a.put(JSONObject().put("s", src).put("t", text))
        p(c).edit().putString("q", a.toString()).apply()
    }

    @Synchronized fun drain(c: Context): String {
        val s = p(c).getString("q", "[]") ?: "[]"
        p(c).edit().putString("q", "[]").apply()
        return s
    }
}
