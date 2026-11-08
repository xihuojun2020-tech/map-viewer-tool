package cn.maptool.reader

import android.app.*
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import java.io.File

class CaptureService : Service() {
    private var projection: MediaProjection?=null
    private var display: VirtualDisplay?=null
    private var reader: ImageReader?=null
    private var overlay: Button?=null
    private var captureFrames=0
    private var ready=false
    private lateinit var windows: WindowManager
    private val handler=Handler(Looper.getMainLooper())
    override fun onBind(intent:Intent?):IBinder?=null
    private fun notification(message:String):Notification {
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java).putExtra("capture",true),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop=PendingIntent.getService(this,1,Intent(this,CaptureService::class.java).setAction("stop"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this,"capture").setSmallIcon(cn.maptool.reader.R.drawable.app_icon).setContentTitle("地图查看工具 · 悬浮截图")
            .setContentText(message).setContentIntent(open).addAction(Notification.Action.Builder(null,"停止截图",stop).build()).setOngoing(true).build()
    }
    override fun onCreate(){
        super.onCreate();windows=getSystemService(WINDOW_SERVICE) as WindowManager
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("capture","阅读截图",NotificationManager.IMPORTANCE_LOW))
        startForeground(11,notification("点击悬浮按钮截取当前阅读画面"))
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action=="stop"){stopSelf();return START_NOT_STICKY}
        if(projection!=null)return START_NOT_STICKY
        @Suppress("DEPRECATION") val data=intent?.getParcelableExtra<Intent>("data")
        if(data==null){stopSelf();return START_NOT_STICKY}
        val manager=getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection=manager.getMediaProjection(intent.getIntExtra("code",Activity.RESULT_CANCELED),data)
        projection!!.registerCallback(object:MediaProjection.Callback(){override fun onStop(){stopSelf()}},handler)
        val metrics=resources.displayMetrics
        val bounds=if(android.os.Build.VERSION.SDK_INT>=30)windows.maximumWindowMetrics.bounds else android.graphics.Rect(0,0,metrics.widthPixels,metrics.heightPixels)
        val width=bounds.width();val height=bounds.height()
        reader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,3)
        reader!!.setOnImageAvailableListener({ source ->
            val image=source.acquireLatestImage()?:return@setOnImageAvailableListener
            try {
                if(captureFrames<=0)return@setOnImageAvailableListener
                captureFrames--
                if(captureFrames>0)return@setOnImageAvailableListener
                display?.surface=null
                val plane=image.planes[0];val rowWidth=plane.rowStride/plane.pixelStride
                val padded=Bitmap.createBitmap(rowWidth,image.height,Bitmap.Config.ARGB_8888);padded.copyPixelsFromBuffer(plane.buffer)
                val bitmap=Bitmap.createBitmap(padded,0,0,image.width,image.height);if(bitmap!==padded)padded.recycle()
                recognize(bitmap)
            }finally{image.close()}
        },handler)
        display=projection!!.createVirtualDisplay("小说阅读截图",width,height,metrics.densityDpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,null,null,handler)
        val button=Button(this);button.text="截图";button.contentDescription="截取阅读文字";overlay=button
        val size=(64*metrics.density).toInt()
        val params=WindowManager.LayoutParams(size,size,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,PixelFormat.TRANSLUCENT)
        params.gravity=Gravity.TOP or Gravity.START;params.x=width-size;params.y=height/2
        var startX=0f;var startY=0f;var baseX=0;var baseY=0;var moved=false
        button.setOnTouchListener { _,event ->
            when(event.action){
                MotionEvent.ACTION_DOWN->{startX=event.rawX;startY=event.rawY;baseX=params.x;baseY=params.y;moved=false}
                MotionEvent.ACTION_MOVE->{if(kotlin.math.abs(event.rawX-startX)+kotlin.math.abs(event.rawY-startY)>12)moved=true;if(moved){params.x=(baseX+event.rawX-startX).toInt();params.y=(baseY+event.rawY-startY).toInt();windows.updateViewLayout(button,params)}}
                MotionEvent.ACTION_UP->{if(!moved)button.performClick()}
            };true
        }
        button.setOnClickListener {
            if(ready){ready=false;button.text="截图";startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("capture",true))}
            else {
                button.visibility=View.INVISIBLE;captureFrames=1
                // Reattach the surface for a fresh frame even when the selected reader is static.
                // Waiting for two spontaneous frames would hang on an unchanged book page.
                button.postOnAnimation { display?.surface=reader!!.surface }
            }
        }
        windows.addView(button,params)
        return START_NOT_STICKY
    }
    private fun recognize(bitmap:Bitmap){
        val engine=TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        engine.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener { result ->
            val text=OcrText.readingOrder(result)
            if(text.isBlank()){
                overlay?.text="重截"
                (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(11,notification("未识别到文字；请确认阅读器允许截图，并选择清晰正文"))
            }else{
                File(filesDir,"import.json").writeText(DocumentImporter.textBook(text,"悬浮截图片段").toString())
                ready=true;overlay?.text="查看"
                (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(11,notification("本地识字完成，点击查看并核对文字；尚未上传"))
            }
        }.addOnFailureListener { error ->
            overlay?.text="重截";(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(11,notification("本地识字失败：${error.message}"))
        }.addOnCompleteListener { bitmap.recycle();engine.close();overlay?.visibility=View.VISIBLE }
    }
    override fun onDestroy(){
        overlay?.let{windows.removeView(it)};overlay=null
        display?.release();reader?.close();projection?.stop();projection=null
        super.onDestroy()
    }
}
