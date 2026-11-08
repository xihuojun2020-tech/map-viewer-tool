package cn.maptool.reader

import com.google.mlkit.vision.text.Text

object OcrText {
    // ML Kit returns layout blocks, whose order is not necessarily reading order.
    fun readingOrder(result: Text): String = result.textBlocks.flatMap { it.lines }
        .sortedWith(compareBy({ it.boundingBox?.top ?: Int.MAX_VALUE }, { it.boundingBox?.left ?: Int.MAX_VALUE }))
        .joinToString("\n") { it.text }
}
