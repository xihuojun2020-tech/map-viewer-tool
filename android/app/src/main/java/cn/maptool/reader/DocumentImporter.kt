package cn.maptool.reader

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory

object DocumentImporter {
    fun bounded(stream: InputStream, max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(16384)
        var total = 0
        while (true) {
            val n = stream.read(buffer); if (n < 0) break
            total += n; require(total <= max) { "文件超过本次导入大小上限" }; out.write(buffer, 0, n)
        }
        return out.toByteArray()
    }
    fun textBook(text: String, title: String): JSONObject {
        val chapters = JSONArray(); var heading = "片段"; var paragraphs = JSONArray()
        val pattern = Regex("^(第[零〇一二三四五六七八九十百千万两0-9]+[章节回].*|番外.*|序章.*|楔子.*)$")
        fun flush() {
            if (paragraphs.length() > 0) chapters.put(JSONObject().put("index", chapters.length()+1).put("title", heading).put("paragraphs", paragraphs))
        }
        text.replace("\r\n", "\n").split('\n').forEach { raw ->
            val line = raw.trim()
            if (pattern.matches(line)) { flush(); heading = line; paragraphs = JSONArray() }
            else if (line.isNotEmpty()) paragraphs.put(line)
        }
        flush(); require(chapters.length() > 0) { "没有读取到正文" }
        return JSONObject().put("title", title).put("chapters", chapters)
    }
    private fun xml(bytes: ByteArray): org.w3c.dom.Document {
        val factory = DocumentBuilderFactory.newInstance()
        factory.isNamespaceAware = true
        factory.setExpandEntityReferences(false)
        val builder = factory.newDocumentBuilder()
        builder.setEntityResolver { _, _ -> throw org.xml.sax.SAXException("电子书不能读取外部实体") }
        return builder.parse(ByteArrayInputStream(bytes))
    }
    fun parse(bytes: ByteArray, name: String): JSONObject {
        if (name.endsWith(".epub", true)) {
            val entries = mutableMapOf<String, ByteArray>(); var total = 0
            ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    val data = bounded(zip, 32*1024*1024-total); total += data.size
                    if (!entry.isDirectory && listOf(".xml", ".opf", ".html", ".xhtml").any { entry.name.endsWith(it, true) }) entries[entry.name] = data
                }
            }
            val container = xml(entries["META-INF/container.xml"] ?: error("电子书缺少目录文件"))
            val root = container.getElementsByTagNameNS("*", "rootfile").item(0) as org.w3c.dom.Element
            val opfPath = root.getAttribute("full-path"); val packageXml = xml(entries[opfPath] ?: error("电子书缺少书目"))
            val manifest = packageXml.getElementsByTagNameNS("*", "item"); val hrefs = mutableMapOf<String,String>()
            for (i in 0 until manifest.length) { val node = manifest.item(i) as org.w3c.dom.Element; hrefs[node.getAttribute("id")] = node.getAttribute("href") }
            val spine = packageXml.getElementsByTagNameNS("*", "itemref"); val chapters = JSONArray()
            for (i in 0 until spine.length) {
                val ref = spine.item(i) as org.w3c.dom.Element
                val href = hrefs[ref.getAttribute("idref")] ?: error("电子书章节引用不存在")
                val path = java.net.URI(opfPath).resolve(href.substringBefore('#')).path
                val doc = xml(entries[path] ?: error("电子书章节文件缺失")); val ps = doc.getElementsByTagNameNS("*", "p"); val paragraphs = JSONArray()
                for (j in 0 until ps.length) {
                    val text = (ps.item(j).textContent ?: error("电子书含有无法解析的文字或实体，请先导出为普通文本")).trim()
                    if (text.isNotEmpty()) paragraphs.put(text)
                }
                if (paragraphs.length() > 0) {
                    val headings = doc.getElementsByTagNameNS("*", "h1")
                    val title = if (headings.length > 0) headings.item(0).textContent else "第${chapters.length()+1}章"
                    chapters.put(JSONObject().put("index", chapters.length()+1).put("title", title).put("paragraphs", paragraphs))
                }
            }
            require(chapters.length() > 0) { "电子书没有可读取的文字段落" }
            val titles = packageXml.getElementsByTagNameNS("*", "title")
            return JSONObject().put("title", if(titles.length>0) titles.item(0).textContent else name.substringBeforeLast('.')).put("chapters", chapters)
        }
        val text = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
            catch (_: java.nio.charset.CharacterCodingException) { charset("GB18030").newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
        return if (name.endsWith(".json", true)) JSONObject(text) else textBook(text.removePrefix("\uFEFF"), name.substringBeforeLast('.'))
    }
}
