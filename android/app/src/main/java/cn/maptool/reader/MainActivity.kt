package cn.maptool.reader

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.Settings
import android.webkit.*
import androidx.webkit.WebViewAssetLoader
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.FrameLayout
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var settings: PrivateSettings
    private val executor = Executors.newFixedThreadPool(2)
    private val base = "https://appassets.androidplatform.net/"
    private val service = "https://genghaodewuwa.xyz/map-tool/api/v1"
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = PrivateSettings(this)
        window.statusBarColor = Color.rgb(32,52,65); window.navigationBarColor = Color.rgb(32,52,65)
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0)
        web = WebView(this); web.setBackgroundColor(Color.rgb(238,234,221))
        val root=FrameLayout(this);root.setBackgroundColor(Color.rgb(32,52,65));root.addView(web,FrameLayout.LayoutParams(-1,-1));setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root){view,insets->
            val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);insets
        }
        web.settings.javaScriptEnabled = true; web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false; web.settings.allowContentAccess = false
        web.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        val assets = WebViewAssetLoader.Builder().addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (uri.host == "appassets.androidplatform.net" && uri.scheme == "https") {
                    if (uri.path?.startsWith("/private/") == true) {
                        val name = uri.lastPathSegment ?: ""
                        if (name == "import.json" || name.matches(Regex("response-[0-9]+\\.json"))) {
                            val file = File(if(name=="import.json") filesDir else cacheDir, name)
                            if (file.exists()) return WebResourceResponse("application/json", "UTF-8", file.inputStream())
                        }
                        return WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream("没有待导入内容".toByteArray()))
                    }
                    val response=assets.shouldInterceptRequest(uri)
                    if(uri.path?.endsWith(".mjs")==true)response?.mimeType="text/javascript"
                    return response
                }
                return null
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "https" && request.url.host == "appassets.androidplatform.net") return false
                if (request.url.scheme in listOf("https", "http")) startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(Bridge(), "MapTool")
        if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            importBook(DocumentImporter.textBook(intent.getStringExtra(Intent.EXTRA_TEXT) ?: "", "分享片段"))
        } else if (intent.action == Intent.ACTION_SEND && intent.type?.startsWith("image/") == true) {
            web.loadUrl(base+"tools.html"); @Suppress("DEPRECATION") val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM); if(uri!=null) ocr(uri)
        } else web.loadUrl(base+if(intent.getBooleanExtra("capture",false)) "tools.html?import=1" else "index.html")
    }
    private fun showError(message: String) { runOnUiThread { android.app.AlertDialog.Builder(this).setTitle("操作未完成").setMessage(message).setPositiveButton("知道了", null).show() } }
    override fun onNewIntent(intent:Intent){
        super.onNewIntent(intent);setIntent(intent)
        if(intent.getBooleanExtra("capture",false))web.loadUrl(base+"tools.html?import=1")
        else if(intent.action==Intent.ACTION_SEND&&intent.type=="text/plain")importBook(DocumentImporter.textBook(intent.getStringExtra(Intent.EXTRA_TEXT)?:"","分享片段"))
        else if(intent.action==Intent.ACTION_SEND&&intent.type?.startsWith("image/")==true){@Suppress("DEPRECATION") val uri=intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM);if(uri!=null)ocr(uri)}
    }
    private fun importBook(book: JSONObject) {
        File(filesDir,"import.json").writeText(book.toString()); runOnUiThread { web.loadUrl(base+"tools.html?import=1") }
    }
    private fun ocr(uri: Uri) {
        try {
            val engine = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
            engine.process(InputImage.fromFilePath(this,uri)).addOnSuccessListener { result ->
                val text=OcrText.readingOrder(result)
                if(text.isBlank()) showError("没有识别到正文，请选择清晰的阅读截图")
                else importBook(DocumentImporter.textBook(text,"截图片段"))
            }.addOnFailureListener { showError("本地识字失败：${it.message}") }.addOnCompleteListener { engine.close() }
        } catch (e: Exception) { showError("无法读取图片：${e.message}") }
    }
    private fun requestCapture() {
        if (!Settings.canDrawOverlays(this)) {
            showError("请允许地图查看工具显示悬浮窗，返回后再点击开启截图")
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))); return
        }
        if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),103)
            return
        }
        startProjection()
    }
    private fun startProjection(){
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        @Suppress("DEPRECATION")
        startActivityForResult(manager.createScreenCaptureIntent(),102)
    }
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){
        super.onRequestPermissionsResult(requestCode,permissions,grantResults)
        if(requestCode==103)startProjection()
    }
    @Deprecated("Platform activity result retained for a small framework-only host")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        if(resultCode!=RESULT_OK || data==null)return
        if(requestCode==102){startForegroundService(Intent(this,CaptureService::class.java).putExtra("code",resultCode).putExtra("data",data));return}
        val uri=data.data?:return
        if(requestCode==101){ocr(uri);return}
        executor.execute {
            try {
                val name=contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { c->c.moveToFirst();c.getString(0) }?:"导入小说.txt"
                val bytes=contentResolver.openInputStream(uri)!!.use { DocumentImporter.bounded(it,12*1024*1024) }
                importBook(DocumentImporter.parse(bytes,name))
            } catch(e:Exception){showError("导入失败：${e.message}")}
        }
    }
    private fun response(id: String, result: JSONObject) { runOnUiThread { web.evaluateJavascript("window.MapToolResult&&window.MapToolResult(${JSONObject.quote(id)},${result});",null) } }
    inner class Bridge {
        @JavascriptInterface fun getSettings(): String {
            val current=settings.read();return JSONObject().put("mode",current.optString("mode","hosted"))
                .put("endpoint",current.optString("endpoint","https://opencode.ai/inference/go/openai/v1/chat/completions"))
                .put("model",current.optString("model","deepseek-v4.1-flash"))
                .put("hasKey",current.optString("key").isNotEmpty()).put("hasToken",current.optString("token").isNotEmpty()).toString()
        }
        @JavascriptInterface fun saveSettings(raw: String): String {
            return try {
                val value=JSONObject(raw);val old=settings.read()
                for(k in listOf("key","token"))if(value.optString(k).isBlank())value.put(k,old.optString(k))
                require(URL(value.getString("endpoint")).protocol=="https") { "模型接口必须使用安全连接" }
                settings.save(value);JSONObject().put("ok",true).toString()
            }catch(e:Exception){JSONObject().put("error",e.message).toString()}
        }
        @JavascriptInterface fun pickDocument(){runOnUiThread { @Suppress("DEPRECATION") startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),100) }}
        @JavascriptInterface fun pickImage(){runOnUiThread { @Suppress("DEPRECATION") startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"),101) }}
        @JavascriptInterface fun startCapture(){runOnUiThread { requestCapture() }}
        @JavascriptInterface fun stopCapture(){stopService(Intent(this@MainActivity,CaptureService::class.java))}
        @JavascriptInterface fun returnToReading(){runOnUiThread{moveTaskToBack(true)}}
        @JavascriptInterface fun checkUpdates(){AppUpdates(this@MainActivity,executor).check()}
        @JavascriptInterface fun releaseResponse(id:String){if(id.matches(Regex("[0-9]+")))File(cacheDir,"response-$id.json").delete()}
        @JavascriptInterface fun request(id: String, route: String, body: String){
            if(!id.matches(Regex("[0-9]+")))return
            executor.execute {
                try {
                    val config=settings.read(); val model=route=="model"
                    val libraryGet=route=="library/versions" || route=="library/requests" ||
                        route.matches(Regex("library/search\\?q=[^#\\s]+")) ||
                        route.matches(Regex("library/books/fq-[0-9]{1,24}(/directory(\\?refresh=1)?|/availability\\?[A-Za-z0-9%=&._-]+)?")) ||
                        route.matches(Regex("library/requests/[a-f0-9]{32}")) ||
                        route.matches(Regex("layers/[a-f0-9]{64}/(manifest|download)"))
                    val libraryPost=route=="library/requests" || route.matches(Regex("library/requests/[a-f0-9]{32}/cancel")) ||
                        route.matches(Regex("library/books/fq-[0-9]{1,24}/refresh-chapter"))
                    val posting=body.isNotEmpty()
                    require(model || route=="jobs" || route=="create" || route.matches(Regex("jobs/[a-z0-9-]+(/result(\\?after=[0-9]+)?)?")) ||
                        (if(posting)libraryPost else libraryGet)) { "请求路径无效" }
                    val endpoint=if(model)config.getString("endpoint")else service+"/"+if(route=="create")"jobs" else route
                    val url=URL(endpoint);require(url.protocol=="https") { "接口必须使用安全连接" }
                    val key=config.optString(if(model)"key" else "token");require(key.isNotBlank()) { if(model)"请先填写自己的模型密钥" else "请先填写内测访问凭据" }
                    val connection=url.openConnection() as HttpURLConnection
                    connection.instanceFollowRedirects=false;connection.connectTimeout=20000;connection.readTimeout=180000
                    connection.setRequestProperty("Authorization","Bearer $key")
                    connection.setRequestProperty("User-Agent","MapTool/0.1 (novel-geography)")
                    if(model)connection.setRequestProperty("x-opencode-session","maptool-device-analysis")
                    if(route=="create"||model||(libraryPost&&posting)){
                        connection.requestMethod="POST";connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json")
                        val payload=if(model)JSONObject(body).put("model",config.getString("model")).toString()else body
                        connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
                    }
                    try {
                        val status=connection.responseCode
                        if(status !in 200..299){
                            val raw=connection.errorStream?.use{DocumentImporter.bounded(it,64*1024).toString(Charsets.UTF_8)} ?: ""
                            val message=try{JSONObject(raw).optString("error").takeIf{it.isNotBlank()}}catch(e:org.json.JSONException){null}
                            throw java.io.IOException(message ?: "接口返回错误编号 $status，请稍后检查服务状态")
                        }
                        val bytes=connection.inputStream.use { DocumentImporter.bounded(it,24*1024*1024) }
                        File(cacheDir,"response-$id.json").writeBytes(bytes)
                        response(id,JSONObject().put("ok",true).put("url","/private/response-$id.json"))
                    } finally {connection.disconnect()}
                }catch(e:Exception){response(id,JSONObject().put("ok",false).put("error",e.message?:"网络请求失败"))}
            }
        }
    }
    @Deprecated("Platform back navigation") override fun onBackPressed(){if(web.canGoBack())web.goBack()else super.onBackPressed()}
    override fun onDestroy(){web.removeJavascriptInterface("MapTool");web.destroy();executor.shutdown();super.onDestroy()}
}
