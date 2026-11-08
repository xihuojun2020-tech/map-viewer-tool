package cn.maptool.reader

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.Executor

class AppUpdates(private val activity:Activity,private val executor:Executor) {
    private fun connection(url:String):HttpURLConnection {
        val parsed=URL(url);require(parsed.protocol=="https"&&parsed.host=="genghaodewuwa.xyz") { "更新地址不属于发布服务器" }
        return (parsed.openConnection() as HttpURLConnection).apply {instanceFollowRedirects=false;connectTimeout=20000;readTimeout=60000}
    }
    private fun dialog(title:String,message:String){activity.runOnUiThread{AlertDialog.Builder(activity).setTitle(title).setMessage(message).setPositiveButton("知道了",null).show()}}
    fun check(){executor.execute{
        try{
            val c=connection("https://genghaodewuwa.xyz/map-tool/releases/update.json")
            val envelope=try{require(c.responseCode==200){"更新服务返回错误编号 ${c.responseCode}"};JSONObject(String(c.inputStream.use{DocumentImporter.bounded(it,65536)},Charsets.UTF_8))}finally{c.disconnect()}
            val bytes=Base64.decode(envelope.getString("payload"),Base64.DEFAULT)
            val publicKey=KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(activity.assets.open("update-public.der").use{it.readBytes()}))
            val verifier=Signature.getInstance("SHA256withRSA");verifier.initVerify(publicKey);verifier.update(bytes)
            require(verifier.verify(Base64.decode(envelope.getString("signature"),Base64.DEFAULT))){"更新清单签名不正确，已停止更新"}
            val update=JSONObject(String(bytes,Charsets.UTF_8))
            require(update.getString("package")==activity.packageName){"更新包不属于此应用"}
            @Suppress("DEPRECATION") val info=activity.packageManager.getPackageInfo(activity.packageName,0)
            val version=if(Build.VERSION.SDK_INT>=28)info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
            if(update.getLong("versionCode")<=version){dialog("检查完成","当前已是最新发布版本。离线地图和已保存的小说不受网络状态影响。");return@execute}
            activity.runOnUiThread{AlertDialog.Builder(activity).setTitle("发现新版本").setMessage("版本：${update.getString("versionName")}\n${update.getString("notes")}\n下载后由系统确认安装，保留本地小说和阅读进度。")
                .setNegativeButton("稍后",null).setPositiveButton("下载更新"){_,_->download(update)}.show()}
        }catch(e:Exception){dialog("更新检查失败",e.message?:"无法取得更新清单")}
    }}
    private fun download(update:JSONObject){
        dialog("正在下载","安装包正在下载并校验，完成后会打开系统安装界面。")
        executor.execute{
            try{
                val size=update.getLong("size");require(size in 1..150L*1024*1024){"更新包大小无效"}
                val folder=File(activity.cacheDir,"updates").apply{mkdirs()};val pending=File(folder,"download.part")
                val c=connection(update.getString("url"));val digest=MessageDigest.getInstance("SHA-256");var total=0L
                try{
                    require(c.responseCode==200){"安装包下载失败，错误编号 ${c.responseCode}"}
                    c.inputStream.use{input->pending.outputStream().use{out->val buffer=ByteArray(32768);while(true){val n=input.read(buffer);if(n<0)break;total+=n;require(total<=size){"安装包长度不符"};digest.update(buffer,0,n);out.write(buffer,0,n)}}}
                }finally{c.disconnect()}
                require(total==size&&digest.digest().joinToString(""){"%02x".format(it)}==update.getString("sha256")){"安装包摘要不符，未安装"}
                @Suppress("DEPRECATION") val flags=if(Build.VERSION.SDK_INT>=28)PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
                @Suppress("DEPRECATION") val archive=activity.packageManager.getPackageArchiveInfo(pending.path,flags)?:error("安装包无法读取")
                @Suppress("DEPRECATION") val installed=activity.packageManager.getPackageInfo(activity.packageName,flags)
                require(archive.packageName==activity.packageName){"安装包名称不一致"}
                @Suppress("DEPRECATION") val a=if(Build.VERSION.SDK_INT>=28)archive.signingInfo!!.apkContentsSigners else archive.signatures
                @Suppress("DEPRECATION") val b=if(Build.VERSION.SDK_INT>=28)installed.signingInfo!!.apkContentsSigners else installed.signatures
                require(!a.isNullOrEmpty()&&!b.isNullOrEmpty()){ "安装包缺少签名信息" }
                require(a.map{it.toCharsString()}.toSet()==b.map{it.toCharsString()}.toSet()){ "安装包签名与当前应用不一致" }
                val apk=File(folder,"map-tool-update.apk");if(apk.exists())check(apk.delete()){ "无法替换上次更新文件" };check(pending.renameTo(apk)){"无法保存更新安装包"}
                activity.runOnUiThread{
                    if(!activity.packageManager.canRequestPackageInstalls()){
                        AlertDialog.Builder(activity).setTitle("允许安装更新").setMessage("请允许地图查看工具安装更新，返回后再次点击检查更新。").setPositiveButton("打开设置"){_,_->activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:${activity.packageName}")))}.show()
                    }else{
                        val uri=FileProvider.getUriForFile(activity,activity.packageName+".files",apk)
                        activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                    }
                }
            }catch(e:Exception){dialog("更新未完成",e.message?:"安装包下载或校验失败")}
        }
    }
}
