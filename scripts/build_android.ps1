param(
    [ValidateSet('Debug','Release')][string]$Variant='Debug',
    [string]$Python='py',
    [string]$Gradle='gradle',
    [string]$JavaHome=$env:JAVA_HOME
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$configRoot=Join-Path $env:USERPROFILE '.config\map-tool'
if ($JavaHome) { $env:JAVA_HOME=$JavaHome }
$env:GRADLE_USER_HOME=Join-Path $projectRoot 'tmp\gradle-home'
$privatePasswordFile=Join-Path $configRoot 'signing-password.dpapi'
$loadedPrivatePassword=$false
if (-not $env:MAPTOOL_KEYSTORE -and (Test-Path -LiteralPath $privatePasswordFile)) {
    $env:MAPTOOL_KEYSTORE=Join-Path $configRoot 'map-tool-release.p12'
    $protected=Get-Content -LiteralPath $privatePasswordFile | ConvertTo-SecureString
    $env:MAPTOOL_STORE_PASSWORD=[Net.NetworkCredential]::new('', $protected).Password
    $loadedPrivatePassword=$true
}
$localGradle=Join-Path $projectRoot 'tmp\android-tools\gradle-8.11.1\bin\gradle.bat'
if ($Gradle -eq 'gradle' -and (Test-Path -LiteralPath $localGradle)) { $Gradle=$localGradle }
[string[]]$pythonArgs=if ([IO.Path]::GetFileNameWithoutExtension($Python) -eq 'py') { @('-3') } else { @() }
try {
    if ($Variant -eq 'Release' -and (-not $env:MAPTOOL_KEYSTORE -or -not $env:MAPTOOL_STORE_PASSWORD)) { throw '发布构建需要你自己的 MAPTOOL_KEYSTORE 和 MAPTOOL_STORE_PASSWORD；调试构建可使用默认签名。' }
    & $Python @pythonArgs (Join-Path $PSScriptRoot 'build_android_assets.py')
    if($LASTEXITCODE -ne 0){throw '安卓资源构建失败'}
    & $Gradle -p (Join-Path $projectRoot 'android') ":app:assemble$Variant" --console plain
    if($LASTEXITCODE -ne 0){throw '安卓编译失败'}
} finally {
    if ($loadedPrivatePassword) { Remove-Item Env:MAPTOOL_STORE_PASSWORD;Remove-Item Env:MAPTOOL_KEYSTORE;Remove-Variable protected }
}
