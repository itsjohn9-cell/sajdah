import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val signingProperties = Properties()
val signingFile = file(
    System.getenv("SIJDA_SIGNING_PROPERTIES")
        ?: "${System.getProperty("user.home")}/.config/sijda/signing.properties"
)
if (signingFile.exists()) {
    signingFile.inputStream().use { signingProperties.load(it) }
}

android {
    namespace = "app.sijda.sijda"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "app.sijda.sijda"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            if (signingProperties.isNotEmpty()) {
                signingConfig = signingConfigs.create("upload") {
                    storeFile = file(requireNotNull(signingProperties.getProperty("storeFile")))
                    storePassword = requireNotNull(signingProperties.getProperty("storePassword"))
                    keyAlias = requireNotNull(signingProperties.getProperty("keyAlias"))
                    keyPassword = requireNotNull(signingProperties.getProperty("keyPassword"))
                }
            }
        }
    }

    gradle.taskGraph.whenReady {
        if (allTasks.any { it.name.contains("Release", ignoreCase = true) } &&
            signingProperties.isEmpty()) {
            throw GradleException(
                "Release signing is not configured. Set SIJDA_SIGNING_PROPERTIES to a private signing file."
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
