plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "cn.maptool.reader"
    compileSdk = 35
    defaultConfig {
        applicationId = "cn.maptool.reader"
        minSdk = 26
        targetSdk = 35
        versionCode = 10
        versionName = "0.1.9"
    }
    signingConfigs {
        if (System.getenv("MAPTOOL_KEYSTORE") != null) create("release") {
            storeFile = file(System.getenv("MAPTOOL_KEYSTORE"))
            storePassword = System.getenv("MAPTOOL_STORE_PASSWORD")
            keyAlias = "map-tool"
            keyPassword = System.getenv("MAPTOOL_STORE_PASSWORD")
        }
    }
    buildTypes {
        getByName("release") { signingConfig = signingConfigs.findByName("release"); isMinifyEnabled = false }
        getByName("debug") { signingConfigs.findByName("release")?.let { signingConfig = it } }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("com.google.mlkit:text-recognition-chinese:16.0.1")
}
